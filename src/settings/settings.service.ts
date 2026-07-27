import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  value: string;
  type: string;
  description: string | null;
  expiresAt: number;
}

const TTL_MS = 30_000;

const KNOWN_TYPES: Record<string, 'STRING' | 'BOOLEAN' | 'INTEGER' | 'JSON'> = {
  platform_name: 'STRING',
  platform_logo: 'STRING',
  contact_email: 'STRING',
  maintenance_mode: 'BOOLEAN',
  jwt_lifetime_minutes: 'INTEGER',
  refresh_lifetime_days: 'INTEGER',
  password_min_length: 'INTEGER',
  password_require_special: 'BOOLEAN',
  max_upload_size_mb: 'INTEGER',
  allowed_file_types: 'JSON',
  default_max_attempts: 'INTEGER',
  default_pass_grade: 'INTEGER',
  default_duration_minutes: 'INTEGER',
  enable_ai: 'BOOLEAN',
  enable_notifications: 'BOOLEAN',
  enable_certificates: 'BOOLEAN',
  allow_registration: 'BOOLEAN',
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private cache = new Map<string, CacheEntry>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.getAll();
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getCached(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry;
  }

  private setCached(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }

  private parseValue(value: string, type: string): any {
    switch (type) {
      case 'BOOLEAN':
        return value === 'true';
      case 'INTEGER': {
        const n = parseInt(value, 10);
        return isNaN(n) ? value : n;
      }
      case 'JSON':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  private serializeValue(value: any): string {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private inferType(value: any): 'STRING' | 'BOOLEAN' | 'INTEGER' | 'JSON' {
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (typeof value === 'number') return 'INTEGER';
    if (Array.isArray(value) || typeof value === 'object') return 'JSON';
    return 'STRING';
  }

  private validateValue(value: any, type: string): void {
    switch (type) {
      case 'BOOLEAN':
        if (typeof value !== 'boolean') throw new Error(`Expected boolean, got ${typeof value}`);
        break;
      case 'INTEGER':
        if (!Number.isInteger(value) && typeof value !== 'number') {
          throw new Error(`Expected integer, got ${typeof value}`);
        }
        break;
      case 'JSON':
        if (typeof value !== 'object' && !Array.isArray(value)) {
          throw new Error(`Expected JSON object/array, got ${typeof value}`);
        }
        break;
      case 'STRING':
        if (typeof value !== 'string') throw new Error(`Expected string, got ${typeof value}`);
        break;
    }
  }

  async get(key: string): Promise<any> {
    const cached = this.getCached(key);
    if (cached) return this.parseValue(cached.value, cached.type);

    const dbSetting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (dbSetting) {
      const type = dbSetting.type || 'STRING';
      this.setCached(key, {
        value: dbSetting.value,
        type,
        description: dbSetting.description,
        expiresAt: Date.now() + TTL_MS,
      });
      return this.parseValue(dbSetting.value, type);
    }

    // Infer type from known types to return a sensible default
    const knownType = KNOWN_TYPES[key] || 'STRING';
    const defaultValue = knownType === 'BOOLEAN' ? false : knownType === 'INTEGER' ? 0 : knownType === 'JSON' ? [] : '';
    return defaultValue;
  }

  async getMany(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    const uncachedKeys: string[] = [];

    for (const key of keys) {
      const cached = this.getCached(key);
      if (cached) {
        result[key] = this.parseValue(cached.value, cached.type);
      } else {
        uncachedKeys.push(key);
      }
    }

    if (uncachedKeys.length > 0) {
      const dbSettings = await this.prisma.systemSetting.findMany({
        where: { key: { in: uncachedKeys } },
      });
      const dbMap = new Map(dbSettings.map((s) => [s.key, s]));

      for (const key of uncachedKeys) {
        const dbSetting = dbMap.get(key);
        if (dbSetting) {
          const type = dbSetting.type || 'STRING';
          this.setCached(dbSetting.key, {
            value: dbSetting.value,
            type,
            description: dbSetting.description,
            expiresAt: Date.now() + TTL_MS,
          });
          result[key] = this.parseValue(dbSetting.value, type);
        } else {
          const knownType = KNOWN_TYPES[key] || 'STRING';
          result[key] = knownType === 'BOOLEAN' ? false : knownType === 'INTEGER' ? 0 : knownType === 'JSON' ? [] : '';
        }
      }
    }

    return result;
  }

  async set(key: string, value: any, type?: string, description?: string): Promise<void> {
    const resolvedType = type || KNOWN_TYPES[key] || this.inferType(value);
    this.validateValue(value, resolvedType);

    const serialized = this.serializeValue(value);

    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: serialized, type: resolvedType, description: description ?? undefined },
      create: { key, value: serialized, type: resolvedType, description: description ?? undefined },
    });

    this.setCached(key, {
      value: serialized,
      type: resolvedType,
      description: description || null,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  async exists(key: string): Promise<boolean> {
    const cached = this.getCached(key);
    if (cached) return true;

    const count = await this.prisma.systemSetting.count({ where: { key } });
    return count > 0;
  }

  async getAll(): Promise<Record<string, any>> {
    const dbSettings = await this.prisma.systemSetting.findMany();
    const result: Record<string, any> = {};

    for (const setting of dbSettings) {
      const type = setting.type || 'STRING';
      this.setCached(setting.key, {
        value: setting.value,
        type,
        description: setting.description,
        expiresAt: Date.now() + TTL_MS,
      });
      result[setting.key] = this.parseValue(setting.value, type);
    }

    // Add defaults for known keys not stored yet
    for (const [key, type] of Object.entries(KNOWN_TYPES)) {
      if (!(key in result)) {
        const defaultValue =
          type === 'BOOLEAN' ? false : type === 'INTEGER' ? 0 : type === 'JSON' ? [] : '';
        result[key] = defaultValue;
      }
    }

    return result;
  }

  // --- Backward-compatible legacy methods ---

  async getSetting(key: string, defaultValue: boolean = false): Promise<boolean> {
    const val = await this.get(key);
    if (val === null || val === undefined) return defaultValue;
    return val === true || val === 'true';
  }

  async updateSetting(key: string, value: boolean): Promise<void> {
    await this.set(key, value, 'BOOLEAN');
  }

  async refreshCache(): Promise<void> {
    this.clearCache();
    await this.getAll();
  }
}
