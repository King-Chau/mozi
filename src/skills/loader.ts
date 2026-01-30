/**
 * Skills 加载器
 * 从不同目录加载 SKILL.md 文件
 */

import { readdir, stat, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { glob } from 'glob';
import type { SkillEntry, SkillSource, SkillsConfig } from './types.js';
import { parseSkillFile } from './parser.js';

/**
 * 检查目录是否存在
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 检查可执行文件是否存在
 */
async function binaryExists(name: string): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查 skill 是否符合运行条件
 */
async function checkEligibility(skill: SkillEntry): Promise<boolean> {
  const { eligibility } = skill.frontmatter;
  if (!eligibility) return true;

  // 检查操作系统
  if (eligibility.os && eligibility.os.length > 0) {
    const currentOS = process.platform;
    const osMap: Record<string, string[]> = {
      darwin: ['darwin', 'macos', 'mac'],
      linux: ['linux'],
      win32: ['win32', 'windows', 'win'],
    };
    const aliases = osMap[currentOS] || [currentOS];
    const matched = eligibility.os.some(os =>
      aliases.includes(os.toLowerCase())
    );
    if (!matched) return false;
  }

  // 检查可执行文件
  if (eligibility.binaries && eligibility.binaries.length > 0) {
    for (const binary of eligibility.binaries) {
      if (!(await binaryExists(binary))) {
        return false;
      }
    }
  }

  // 检查环境变量
  if (eligibility.envVars && eligibility.envVars.length > 0) {
    for (const envVar of eligibility.envVars) {
      if (!process.env[envVar]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * 从目录加载所有 skills
 */
async function loadSkillsFromDirectory(
  directory: string,
  source: SkillSource
): Promise<SkillEntry[]> {
  if (!(await directoryExists(directory))) {
    return [];
  }

  const skills: SkillEntry[] = [];

  try {
    // 查找所有 SKILL.md 文件
    const pattern = join(directory, '**/SKILL.md');
    const files = await glob(pattern, { nodir: true });

    for (const filePath of files) {
      const skill = await parseSkillFile(filePath, source);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch (error) {
    console.error(`Failed to load skills from ${directory}:`, error);
  }

  return skills;
}

/**
 * 获取默认的 skills 目录
 */
export function getDefaultSkillsDirs(): {
  bundled: string;
  user: string;
  workspace: string;
} {
  return {
    bundled: join(import.meta.dirname || __dirname, '../../skills'),
    user: join(homedir(), '.mozi', 'skills'),
    workspace: join(process.cwd(), '.mozi', 'skills'),
  };
}

/**
 * 加载所有 skills
 */
export async function loadAllSkills(
  config?: SkillsConfig
): Promise<SkillEntry[]> {
  const dirs = getDefaultSkillsDirs();
  const allSkills: SkillEntry[] = [];

  // 按优先级加载：bundled -> user -> workspace
  // workspace 优先级最高，可以覆盖同名 skill

  // 1. 加载内置 skills
  const bundledSkills = await loadSkillsFromDirectory(dirs.bundled, 'bundled');
  allSkills.push(...bundledSkills);

  // 2. 加载用户 skills
  const userDir = config?.userDir || dirs.user;
  const userSkills = await loadSkillsFromDirectory(userDir, 'user');
  allSkills.push(...userSkills);

  // 3. 加载工作区 skills
  const workspaceDir = config?.workspaceDir || dirs.workspace;
  const workspaceSkills = await loadSkillsFromDirectory(workspaceDir, 'workspace');
  allSkills.push(...workspaceSkills);

  // 过滤禁用的 skills
  let filteredSkills = allSkills.filter(skill => {
    // 检查 frontmatter 中的 enabled 字段
    if (skill.frontmatter.enabled === false) return false;

    // 检查配置中的禁用列表
    if (config?.disabled?.includes(skill.frontmatter.name)) return false;

    // 如果设置了 only，则只启用列表中的 skills
    if (config?.only && config.only.length > 0) {
      return config.only.includes(skill.frontmatter.name);
    }

    return true;
  });

  // 检查运行条件并过滤
  const eligibleSkills: SkillEntry[] = [];
  for (const skill of filteredSkills) {
    if (await checkEligibility(skill)) {
      eligibleSkills.push(skill);
    }
  }

  // 按优先级排序
  eligibleSkills.sort((a, b) => {
    const priorityA = a.frontmatter.priority ?? 100;
    const priorityB = b.frontmatter.priority ?? 100;
    return priorityA - priorityB;
  });

  // 去重（同名 skill 保留优先级最高的）
  const seen = new Map<string, SkillEntry>();
  for (const skill of eligibleSkills) {
    const name = skill.frontmatter.name;
    if (!seen.has(name)) {
      seen.set(name, skill);
    }
  }

  return Array.from(seen.values());
}
