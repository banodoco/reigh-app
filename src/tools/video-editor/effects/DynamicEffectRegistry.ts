import type { FC } from 'react';
import type { EffectComponentProps } from '@/tools/video-editor/effects/entrances';
import { compileEffect, compileEffectAsync } from '@/tools/video-editor/effects/compileEffect';

export class DynamicEffectRegistry {
  private builtIn: Record<string, FC<EffectComponentProps>>;
  private dynamic: Record<string, { component: FC<EffectComponentProps>; code: string }> = {};

  constructor(builtIn: Record<string, FC<EffectComponentProps>>) {
    this.builtIn = { ...builtIn };
  }

  register(name: string, code: string): void {
    const normalized = this.normalizeName(name);
    if (this.dynamic[normalized]?.code === code) return;
    const component = compileEffect(code);
    this.dynamic[normalized] = { component, code };
  }

  async registerAsync(name: string, code: string): Promise<void> {
    const normalized = this.normalizeName(name);
    if (this.dynamic[normalized]?.code === code) return;
    const component = await compileEffectAsync(code);
    this.dynamic[normalized] = { component, code };
  }

  unregister(name: string): void {
    delete this.dynamic[this.normalizeName(name)];
  }

  get(name: string): FC<EffectComponentProps> | undefined {
    const normalized = this.normalizeName(name);
    return this.builtIn[normalized] ?? this.dynamic[normalized]?.component;
  }

  getCode(name: string): string | undefined {
    return this.dynamic[this.normalizeName(name)]?.code;
  }

  listAll(): string[] {
    return [...new Set([...Object.keys(this.builtIn), ...Object.keys(this.dynamic)])];
  }

  isDynamic(name: string): boolean {
    const normalized = this.normalizeName(name);
    return normalized in this.dynamic && !(normalized in this.builtIn);
  }

  getAllDynamicCode(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.dynamic).map(([name, { code }]) => [name, code]),
    );
  }

  private normalizeName(name: string): string {
    return name.startsWith('custom:') ? name.slice(7) : name;
  }
}
