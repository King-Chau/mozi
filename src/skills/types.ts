/**
 * Skills 模块类型定义
 * 基于 moltbot 的 Skills 架构简化实现
 */

/**
 * Skill 前置条件 - 用于过滤 skill 是否可用
 */
export interface SkillEligibility {
  /** 支持的操作系统列表 */
  os?: string[];
  /** 需要存在的可执行文件列表 */
  binaries?: string[];
  /** 需要存在的环境变量列表 */
  envVars?: string[];
}

/**
 * SKILL.md 文件的 YAML frontmatter 定义
 */
export interface SkillFrontmatter {
  /** Skill 唯一标识符 */
  name: string;
  /** Skill 显示名称 */
  title?: string;
  /** Skill 简短描述 */
  description?: string;
  /** Skill 版本 */
  version?: string;
  /** Skill 作者 */
  author?: string;
  /** 是否启用此 skill */
  enabled?: boolean;
  /** 前置条件 */
  eligibility?: SkillEligibility;
  /** 关键词标签，用于匹配 */
  tags?: string[];
  /** 优先级，数字越小优先级越高 */
  priority?: number;
}

/**
 * 解析后的 Skill 条目
 */
export interface SkillEntry {
  /** Skill 元数据 */
  frontmatter: SkillFrontmatter;
  /** Skill 内容（markdown 格式的 prompt） */
  content: string;
  /** Skill 文件路径 */
  filePath: string;
  /** Skill 来源目录 */
  source: SkillSource;
}

/**
 * Skill 来源类型
 */
export type SkillSource = 'bundled' | 'user' | 'workspace';

/**
 * Skills 配置
 */
export interface SkillsConfig {
  /** 是否启用 skills 功能 */
  enabled?: boolean;
  /** 用户 skills 目录路径 (默认 ~/.mozi/skills) */
  userDir?: string;
  /** 工作区 skills 目录路径 (默认 ./.mozi/skills) */
  workspaceDir?: string;
  /** 禁用的 skill 名称列表 */
  disabled?: string[];
  /** 只启用的 skill 名称列表（如果设置，其他都禁用） */
  only?: string[];
}

/**
 * Skills 注册表接口
 */
export interface SkillsRegistry {
  /** 获取所有已加载的 skills */
  getAll(): SkillEntry[];
  /** 根据名称获取 skill */
  get(name: string): SkillEntry | undefined;
  /** 获取符合条件的 skills */
  getEligible(): SkillEntry[];
  /** 构建 skills prompt */
  buildPrompt(): string;
  /** 重新加载 skills */
  reload(): Promise<void>;
}
