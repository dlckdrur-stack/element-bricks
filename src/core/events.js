import Phaser from 'phaser';

/**
 * 게임 이벤트 이름. 증강(src/augments/*)은 여기에만 붙는다.
 *
 * onHit       { cell, damage, source }   ← 리스너가 ctx.damage 를 바꾸면 실제 피해가 바뀜
 * onKill      { cell, source, overkill }
 * onTurnStart { stage }
 * onTurnEnd   { stage }
 * onWallBounce{ ball, side: 'left'|'right'|'top' }
 * onOrbCollect{ cell, ball, gain }        ← ctx.gain 수정 가능
 * onLaunch    { ball }
 * onBallReturn{ ball, first }
 * onGameOver  { stage, best, newBest }
 */
export const EV = Object.freeze({
  HIT: 'onHit',
  KILL: 'onKill',
  TURN_START: 'onTurnStart',
  TURN_END: 'onTurnEnd',
  WALL_BOUNCE: 'onWallBounce',
  ORB_COLLECT: 'onOrbCollect',
  LAUNCH: 'onLaunch',
  BALL_RETURN: 'onBallReturn',
  GAME_OVER: 'onGameOver',
});

/** 판(씬) 하나당 하나 생성. 씬 재시작 시 새로 만들어 리스너 누수를 막는다. */
export class GameEvents extends Phaser.Events.EventEmitter {}
