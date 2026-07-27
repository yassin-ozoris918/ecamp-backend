export interface DataProvider {
  entity: string;
  collect(filters: Record<string, any> | undefined, prisma: any): Promise<{
    data: Record<string, any>[];
    headers: { key: string; label: string }[];
  }>;
}
