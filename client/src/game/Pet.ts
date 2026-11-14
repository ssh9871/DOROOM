import { PET, PLAYER, WORLD } from './config';
import { battlePetStats, type BattlePet } from './petCatalog';
import type { Player } from './Player';
import { skillCooldown, type SkillId } from './progress';
import { drawSprite } from './sprites';
import { clamp, dampFactor } from './utils';

export class Pet {
  x = 0;
  y = 0;
  cooldownRemaining = 0;
  effectRemaining = 0;
  private castRemaining = 0;
  private time = 0;
  private pet?: BattlePet;
  skill: SkillId = 'shield';

  reset(player: Player, skill: SkillId, pet?: BattlePet): void {
    this.x = player.x + PET.offsetX;
    this.y = player.y + PET.offsetY;
    this.cooldownRemaining = this.effectRemaining = this.castRemaining = this.time = 0;
    this.skill = skill;
    this.pet = pet;
  }

  activate(player: Player, clear: () => void): boolean {
    if (this.cooldownRemaining > 0) return false;
    if (this.skill === 'heal' && !player.heal(this.pet && battlePetStats(this.pet, PLAYER.maxHp).healHp)) return false;
    if (this.skill === 'clear') clear();
    this.cooldownRemaining = this.pet?.ability.cooldownSec ?? skillCooldown;
    this.effectRemaining = this.skill === 'shield' ? 3 : this.skill === 'rapid-fire' ? 5 : 0;
    this.castRemaining = 0.45;
    this.apply(player);
    return true;
  }

  private apply(player: Player): void {
    player.isShieldActive = this.skill === 'shield' && this.effectRemaining > 0;
    player.fireRate = this.skill === 'rapid-fire' && this.effectRemaining > 0 ? this.pet?.ability.effectValue ?? 1.3 : 1;
  }

  update(dt: number, player: Player): void {
    this.time += dt;
    const bob = Math.sin(this.time * 3) * 3;
    const k = dampFactor(PET.followRate, dt);
    this.x += (clamp(player.x + PET.offsetX, 18, WORLD.width - 18) - this.x) * k;
    this.y += (clamp(player.y + PET.offsetY + bob, 20, WORLD.height - 16) - this.y) * k;
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    this.effectRemaining = Math.max(0, this.effectRemaining - dt);
    this.castRemaining = Math.max(0, this.castRemaining - dt);
    this.apply(player);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawSprite(ctx, 'pets/hover-platform', this.x, this.y + 11);
    if (!this.pet || this.pet.id === 'pet-cat-001') {
      drawSprite(ctx, 'pets/pet-cat-001', this.x, this.y, { tag: this.castRemaining > 0 ? 'cast' : 'idle', time: this.time });
      return;
    }
    // shortcut: use species icons until matching combat sprites are available.
    ctx.save();
    ctx.font = `${this.castRemaining > 0 ? 32 : 28}px "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.pet.icon, this.x, this.y);
    ctx.restore();
  }
}
