/** SQLite Store 的创建配置。 */
export interface SqliteStoreConfig {
  /** SQLite 文件路径；使用 ":memory:" 创建内存数据库。 */
  readonly filePath: string;
  /** 设为 false 时跳过文件 migration，适用于已由宿主打包的 schema。 */
  readonly migrationsFolder?: string | false;
}
