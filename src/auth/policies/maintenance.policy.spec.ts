import { Test, TestingModule } from '@nestjs/testing';
import { MaintenancePolicy } from './maintenance.policy';
import { SettingsService } from '../../settings/settings.service';
import { Role } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';

describe('MaintenancePolicy', () => {
  let policy: MaintenancePolicy;
  let settingsService: jest.Mocked<Partial<SettingsService>>;

  beforeEach(async () => {
    settingsService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenancePolicy,
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    policy = module.get<MaintenancePolicy>(MaintenancePolicy);
  });

  describe('validateLogin', () => {
    it('should allow ADMIN login even when maintenance is active', async () => {
      (settingsService.get as jest.Mock).mockResolvedValue(true);
      await expect(policy.validateLogin(Role.ADMIN)).resolves.not.toThrow();
      expect(settingsService.get).not.toHaveBeenCalled(); // Fast path for ADMIN
    });

    it('should block STUDENT login when maintenance is active', async () => {
      (settingsService.get as jest.Mock).mockResolvedValue(true);
      await expect(policy.validateLogin(Role.STUDENT)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should block INSTRUCTOR login when maintenance is active', async () => {
      (settingsService.get as jest.Mock).mockResolvedValue(true);
      await expect(policy.validateLogin(Role.INSTRUCTOR)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should allow STUDENT login when maintenance is inactive', async () => {
      (settingsService.get as jest.Mock).mockResolvedValue(false);
      await expect(policy.validateLogin(Role.STUDENT)).resolves.not.toThrow();
    });
  });

  describe('validateRegistration', () => {
    it('should block registration when maintenance is active', async () => {
      (settingsService.get as jest.Mock).mockResolvedValue(true);
      await expect(policy.validateRegistration()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should allow registration when maintenance is inactive', async () => {
      (settingsService.get as jest.Mock).mockResolvedValue(false);
      await expect(policy.validateRegistration()).resolves.not.toThrow();
    });
  });
});
