/* 武器库 PvP 模拟器与 TTK 计算：仅在切换到 PvP 属性模式时按需载入。 */
window.WPN_PVP = function (H) {
  'use strict';

  var D = H.D, V = H.V, WR = H.WR, S = H.S, body = H.body;
  var W_H = H.W_H, W_AMMO = H.W_AMMO, P_HASH = H.P_HASH, P_ICON = H.P_ICON;
  var STAT_HASH = H.STAT_HASH, TYPE_EN = H.TYPE_EN, RANGE = H.RANGE, RELOAD = H.RELOAD;
  var CHECK_ONLY_PERKS = H.CHECK_ONLY_PERKS, PVP_CHRONO_PERKS = H.PVP_CHRONO_PERKS, AUTO_PERKS = H.AUTO_PERKS;
  var esc = H.esc, imgTag = H.imgTag, typeName = H.typeName, frameOf = H.frameOf, frameKey = H.frameKey;
  var isExotic = H.isExotic, ammoEn = H.ammoEn, poolRow = H.poolRow, cellsOf = H.cellsOf;
  var isEnhancedPlug = H.isEnhancedPlug, plugName = H.plugName, rollOf = H.rollOf, compute = H.compute;
  var effStatVal = H.effStatVal, rangeMeters = H.rangeMeters, reloadSeconds = H.reloadSeconds;
  var handlingTimes = H.handlingTimes, rangeFalloffSvg = H.rangeFalloffSvg, fmtM = H.fmtM, fmtS = H.fmtS;
  var ensurePerkFx = H.ensurePerkFx, perkSpec = H.perkSpec, resolvedPerkSpec = H.resolvedPerkSpec;
  var resolveAmmoSpec = H.resolveAmmoSpec, fxAll = H.fxAll, fxDmgOf = H.fxDmgOf, fxMulOf = H.fxMulOf;
  var perkStepOf = H.perkStepOf, perkSteps = H.perkSteps, pickStep = H.pickStep;
  var calculateOverflowSteps = H.calculateOverflowSteps, renderDetail = H.renderDetail;

  function pvpDmg(typeZh, frameZh) {
    var t = PVP_FRAMES[TYPE_EN[typeZh]];
    if (!t) { return null; }
    var k = frameKey(frameZh);
    return (k && t[k]) || null;
  }
  var PVP_HP = 230, PVP_EPS = 1e-9, PVP_INTRA_BURST = 0.0667;
  var PVP_BOW_A = { bodyDmg: 219.81, headDmg: 256.92 };
  var PVP_BOW_B = { bodyDmg: 216.17, headDmg: 290.34 };
  var PVP_BOW_C = { bodyDmg: 199.02, headDmg: 266.45 };
  var PVP_FRAMES = {
    'Auto Rifle': {
      Adaptive: { bodyDmg: 15.5, headDmg: 27.21 }, 'Balanced Heat': { bodyDmg: 20.01, headDmg: 33.93 },
      'High Impact': { bodyDmg: 22, headDmg: 39.48 }, Lightweight: { bodyDmg: 13.61, headDmg: 23.09 },
      Precision: { bodyDmg: 20.01, headDmg: 33.93 }, 'Rapid Fire': { bodyDmg: 13.61, headDmg: 23.08 },
      Support: { bodyDmg: 18.85, headDmg: 26.42 }
    },
    'Pulse Rifle': {
      Adaptive: { bodyDmg: 22, headDmg: 36.45, burstSize: 3 },
      'Aggressive Burst': { bodyDmg: 15.5, headDmg: 30.55, burstSize: 4 },
      'Balanced Heat': { bodyDmg: 15.5, headDmg: 28.73, burstSize: 3 },
      'Dynamic Heat': { bodyDmg: 15.89, headDmg: 29.45, burstSize: 3 },
      'Heavy Burst': { bodyDmg: 23.02, headDmg: 42.66, burstSize: 2, intraBurstDelay: 0.1 },
      'High Impact': { bodyDmg: 21.5, headDmg: 38.58, burstSize: 3 },
      'Legacy PR 55': { bodyDmg: 19.71, headDmg: 31.5, burstSize: 3 },
      Lightweight: { bodyDmg: 18.82, headDmg: 30.07, burstSize: 3 },
      'Rapid Fire': { bodyDmg: 15.5, headDmg: 28.73, burstSize: 3 },
      'Micro Missile': { bodyDmg: 30.23, headDmg: 30.23, burstSize: 3, ammoPerBurst: true, intraBurstDelay: 4 / 30, rpm: 5400 / 17 }
    },
    'Scout Rifle': {
      Aggressive: { bodyDmg: 54.03, headDmg: 91.63 }, 'Balanced Heat': { bodyDmg: 27.32, headDmg: 53.31 },
      'High Impact': { bodyDmg: 42.01, headDmg: 84.43 }, Lightweight: { bodyDmg: 38.02, headDmg: 64.49 },
      Precision: { bodyDmg: 38.53, headDmg: 69.13 }, 'Rapid Fire': { bodyDmg: 27.32, headDmg: 53.31 }
    },
    'Hand Cannon': {
      Adaptive: { bodyDmg: 44.53, headDmg: 79.88 }, Aggressive: { bodyDmg: 48.73, headDmg: 90.3 },
      'Dynamic Heat': { bodyDmg: 46.45, headDmg: 72.41, ammoTypeOverrides: { Special: { bodyDmg: 60.05, headDmg: 90.08 } } },
      'Heavy Burst': { bodyDmg: 24.01, headDmg: 52.84 }, Lightweight: { bodyDmg: 44.52, headDmg: 80.1 },
      Precision: { bodyDmg: 45.32, headDmg: 70.64 }, 'Spread Shot': { bodyDmg: 120.02, headDmg: 144.72 }
    },
    Sidearm: {
      Adaptive: { bodyDmg: 36.02, headDmg: 57.56 }, 'Adaptive Burst': { bodyDmg: 20.01, headDmg: 37.07, burstSize: 3 },
      'Dynamic Heat': { bodyDmg: 31.8, headDmg: 50.81 },
      'Heavy Burst': { bodyDmg: 31.02, headDmg: 49.57, burstSize: 2, intraBurstDelay: 0.1 },
      Lightweight: { bodyDmg: 31.02, headDmg: 49.57 }, 'Micro Missile': { bodyDmg: 158.37, headDmg: 158.37 },
      Precision: { bodyDmg: 40.01, headDmg: 63.94 }, 'Rapid Fire': { bodyDmg: 25.02, headDmg: 39.98 },
      'Together Forever': { bodyDmg: 36.03, headDmg: 57.57 }
    },
    'Submachine Gun': {
      Adaptive: { bodyDmg: 11.5, headDmg: 19.06 }, Aggressive: { bodyDmg: 13.61, headDmg: 23.88 },
      'Aggressive Burst': { bodyDmg: 15.02, headDmg: 26.35 }, 'Balanced Heat': { bodyDmg: 10.6, headDmg: 20.06 },
      Lightweight: { bodyDmg: 10.6, headDmg: 20.06 }, 'MIDA Synergy': { bodyDmg: 10.6, headDmg: 20.05 },
      Precision: { bodyDmg: 16.71, headDmg: 26.71 }
    },
    'Combat Bow': {
      'High Impact Longbow': { bodyDmg: 120.94, headDmg: 157.7, isChargeTime: true, isBow: true },
      Lightweight: { bodyDmg: 77.6, headDmg: 124.01, isChargeTime: true, isBow: true },
      Precision: { bodyDmg: 100.79, headDmg: 131.43, isChargeTime: true, isBow: true },
      'High Impact': {
        bodyDmg: 196.52, headDmg: 263.95,
        perkOverrides: {
          3603807747: PVP_BOW_A, 2523856971: PVP_BOW_A,
          1202133695: PVP_BOW_B, 2181638943: PVP_BOW_B,
          2136073194: PVP_BOW_C, 600923142: PVP_BOW_C
        }
      }
    },
    'Trace Rifle': { Adaptive: { bodyDmg: 15.01, headDmg: 20.16 } },
    'Fusion Rifle': {
      Adaptive: { bodyDmg: 46.3, headDmg: 46.3, isChargeTime: true, isFusion: true, boltsPerBurst: 7, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } },
      Aggressive: { bodyDmg: 28.82, headDmg: 28.82, isChargeTime: true, isFusion: true, boltsPerBurst: 12, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 4, recovery: 19 / 30 } },
      'High Impact': { bodyDmg: 79.22, headDmg: 79.22, isChargeTime: true, isFusion: true, boltsPerBurst: 5, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } },
      Precision: { bodyDmg: 48, headDmg: 48, isChargeTime: true, isFusion: true, boltsPerBurst: 7, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } },
      'Rapid Fire': { bodyDmg: 33.97, headDmg: 33.97, isChargeTime: true, isFusion: true, boltsPerBurst: 9, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } }
    },
    Shotgun: {
      Aggressive: { bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
      'Shot Package': { bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
      'Heavy Burst': { bodyDmg: 107.06, headDmg: 187.87, rpm: 60 / (19 / 30) },
      Lightweight: { bodyDmg: 23.01, headDmg: 25.49, isShotgun: true, pelletsPerShot: 12 },
      'Pinpoint Slug': { bodyDmg: 170.1, headDmg: 298.51 },
      Precision: { bodyDmg: 23.01, headDmg: 25.49, isShotgun: true, pelletsPerShot: 12 },
      'Rapid Fire': { bodyDmg: 20, headDmg: 22.15, isShotgun: true, pelletsPerShot: 12 },
      'Rapid Fire Slug': { bodyDmg: 160.11, headDmg: 280.97 }
    },
    'Sniper Rifle': {
      Adaptive: { bodyDmg: 125.03, headDmg: 405.74 }, Aggressive: { bodyDmg: 141.89, headDmg: 496.63 },
      'High Impact': { bodyDmg: 155.09, headDmg: 427.25 }, 'Dynamic Heat': { bodyDmg: 113.11, headDmg: 389.22 },
      'Rapid Fire': { bodyDmg: 85.03, headDmg: 292.62 }, Disruption: { bodyDmg: 253.46, headDmg: 698.26 }
    },
    Glaive: {
      Adaptive: { bodyDmg: 136.56, headDmg: 136.56 }, Aggressive: { bodyDmg: 147.52, headDmg: 147.52 },
      Melee: { bodyDmg: 97.54, headDmg: 97.54 }, 'Rapid Fire': { bodyDmg: 120.85, headDmg: 120.85 }
    },
    Sword: {
      Adaptive: { bodyDmg: 230, headDmg: 230 }, Aggressive: { bodyDmg: 230, headDmg: 230 },
      Caster: { bodyDmg: 230, headDmg: 230 }, Lightweight: { bodyDmg: 230, headDmg: 230 },
      Vortex: { bodyDmg: 230, headDmg: 230 }, 'Wave Sword': { bodyDmg: 230, headDmg: 230 }
    },
    'Grenade Launcher': {
      Adaptive: { bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
      'Rapid Fire': { bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
      'Area Denial': {
        bodyDmg: 7.8, headDmg: 7.8,
        areaDenial: { projectileDamage: 7.8, projectiles: 5, tickDamage: 20.01, tickInterval: 0.25, activationDelay: 0.5, ticks: 22 },
        notes: '假定全部 5 枚弹头命中且目标持续停留在领域内；重叠领域不叠加伤害，且不计飞行与连发延迟。'
      },
      'Micro Missile': { bodyDmg: 143.83, headDmg: 143.83 },
      Wave: { bodyDmg: 139, headDmg: 139 },
      'Compressed Wave': { bodyDmg: 159, headDmg: 159 }
    },
    'Linear Fusion Rifle': {
      'Adaptive Burst': { bodyDmg: 78.4, headDmg: 269.79, isChargeTime: true, chargeBurstSize: 3, intraBurstDelay: 0.2, chargeRecovery: 0.5 },
      Precision: { bodyDmg: 165.09, headDmg: 568.09, isChargeTime: true, chargeBurstSize: 1, chargeRecovery: 0.5 }
    },
    'Machine Gun': {
      Adaptive: { bodyDmg: 41.5, headDmg: 58.18 }, Aggressive: { bodyDmg: 36.03, headDmg: 46.98 },
      'Balanced Heat': { bodyDmg: 25.53, headDmg: 33.29 }, 'High Impact': { bodyDmg: 47.49, headDmg: 68.44 },
      'Rapid Fire': { bodyDmg: 25.53, headDmg: 33.29 }
    },
    'Rocket Launcher': {
      Adaptive: { bodyDmg: 306, headDmg: 306 }, Aggressive: { bodyDmg: 306, headDmg: 306 },
      'High Impact': { bodyDmg: 312, headDmg: 312 }, Precision: { bodyDmg: 277, headDmg: 277 }
    }
  };
  var PVP_EXOTICS = {
    Centrifuse: { weaponType: 'Auto Rifle', bodyDmg: 20.01, headDmg: 33.94 },
    'Cerberus+1': { weaponType: 'Auto Rifle', bodyDmg: 18.70380029, headDmg: 33.55681817, pelletsPerShot: 4, modelAssumptions: ['以衰减前基础伤害计算（贴脸伤害低 16.67%），且假定 4 枚弹头全部命中。'] },
    'Choir of One': { weaponType: 'Auto Rifle', bodyDmg: 41.99, headDmg: 75.33 },
    'Hard Light': { weaponType: 'Auto Rifle', bodyDmg: 15.5, headDmg: 27.21 },
    'Khvostov 7G-0X': { weaponType: 'Auto Rifle', bodyDmg: 15.02, headDmg: 26.36 },
    'Monte Carlo': { weaponType: 'Auto Rifle', bodyDmg: 15.5, headDmg: 27.21 },
    Necrochasm: { weaponType: 'Auto Rifle', bodyDmg: 13.61, headDmg: 23.08 },
    'Quicksilver Storm': { weaponType: 'Auto Rifle', bodyDmg: 13.61, headDmg: 23.09 },
    'SUROS Regime': { weaponType: 'Auto Rifle', bodyDmg: 15.02, headDmg: 26.36 },
    'Sweet Business': { weaponType: 'Auto Rifle', bodyDmg: 16.46, headDmg: 25.34 },
    "Tommy's Matchbook": { weaponType: 'Auto Rifle', bodyDmg: 13.61, headDmg: 23.08 },
    Heirloom: { weaponType: 'Bow', bodyDmg: 164.74, headDmg: 172.36, hitCountOnly: true },
    'Hierarchy of Needs': { weaponType: 'Bow', bodyDmg: 121, headDmg: 157.77, isChargeTime: true, isBow: true },
    'Le Monarque': { weaponType: 'Bow', bodyDmg: 92.6, headDmg: 139.01, isChargeTime: true, isBow: true },
    "Leviathan's Breath": { weaponType: 'Bow', bodyDmg: 196.52, headDmg: 263.95, isChargeTime: true, isBow: true },
    "Ticuu's Divination": { weaponType: 'Bow', bodyDmg: 77.61, headDmg: 124.03, isChargeTime: true, isBow: true },
    'Trinity Ghoul': { weaponType: 'Bow', bodyDmg: 102.78, headDmg: 134.02, isChargeTime: true, isBow: true },
    'Verglas Curve': { weaponType: 'Bow', bodyDmg: 77.6, headDmg: 124.01, isChargeTime: true, isBow: true },
    'Wish-Ender': { weaponType: 'Bow', bodyDmg: 86.99, headDmg: 133.73, isChargeTime: true, isBow: true },
    'Wish-Keeper': { weaponType: 'Bow', bodyDmg: 100.79, headDmg: 131.43, isChargeTime: true, isBow: true },
    'Ace of Spades': { weaponType: 'Hand Cannon', bodyDmg: 44.53, headDmg: 79.88 },
    Crimson: { weaponType: 'Hand Cannon', bodyDmg: 18.01, headDmg: 33.37, burstSize: 3, intraBurstDelay: 0.1 },
    'Graviton Spike': { weaponType: 'Hand Cannon', bodyDmg: 42.03, headDmg: 77.87 },
    Hawkmoon: { weaponType: 'Hand Cannon', bodyDmg: 44.52, headDmg: 79.88 },
    Lumina: { weaponType: 'Hand Cannon', bodyDmg: 44.52, headDmg: 79.88 },
    Malfeasance: { weaponType: 'Hand Cannon', bodyDmg: 45.29, headDmg: 70.6 },
    Sturm: { weaponType: 'Hand Cannon', bodyDmg: 48.73, headDmg: 90.3 },
    Sunshot: { weaponType: 'Hand Cannon', bodyDmg: 42.03, headDmg: 77.68 },
    'The Last Word': { weaponType: 'Hand Cannon', bodyDmg: 43.09, headDmg: 77.3 },
    Thorn: { weaponType: 'Hand Cannon', bodyDmg: 46.13, headDmg: 81.48 },
    Turncoat: { weaponType: 'Hand Cannon', bodyDmg: 69.55, headDmg: 104.9 },
    'Bad Juju': { weaponType: 'Pulse Rifle', bodyDmg: 15.5, headDmg: 28.73, burstSize: 3 },
    'Collective Obligation': { weaponType: 'Pulse Rifle', bodyDmg: 19.71, headDmg: 32.66, burstSize: 3 },
    'Graviton Lance': { weaponType: 'Pulse Rifle', bodyDmg: 23.03, headDmg: 42.68, burstSize: 2, intraBurstDelay: 0.1 },
    'New Malpais': { weaponType: 'Pulse Rifle', bodyDmg: 30.23, headDmg: 30.23, burstSize: 3, ammoPerBurst: true, intraBurstDelay: 4 / 30, rpm: 5400 / 17 },
    'No Time to Explain': { weaponType: 'Pulse Rifle', bodyDmg: 21.5, headDmg: 38.57, burstSize: 3 },
    'Outbreak Perfected': { weaponType: 'Pulse Rifle', bodyDmg: 19.71, headDmg: 31.5, burstSize: 3 },
    'Red Death Reformed': { weaponType: 'Pulse Rifle', bodyDmg: 21.5, headDmg: 38.58, burstSize: 3 },
    'Revision Zero': { weaponType: 'Pulse Rifle', bodyDmg: 15.5, headDmg: 30.55, burstSize: 4, originTraitOverrides: { 2206869417: { bodyDmg: 23.02, headDmg: 42.66, burstSize: 2, intraBurstDelay: 0.1 } } },
    'Vigilance Wing': { weaponType: 'Pulse Rifle', bodyDmg: 16.13, headDmg: 26.09, burstSize: 5 },
    "Dead Man's Tale": { weaponType: 'Scout Rifle', bodyDmg: 54.03, headDmg: 91.63 },
    'MIDA Multi-Tool': { weaponType: 'Scout Rifle', bodyDmg: 38.02, headDmg: 64.49 },
    'Polaris Lance': { weaponType: 'Scout Rifle', bodyDmg: 42.04, headDmg: 84.5 },
    "Skyburner's Oath": { weaponType: 'Scout Rifle', bodyDmg: 42.01, headDmg: 84.22 },
    Symmetry: { weaponType: 'Scout Rifle', bodyDmg: 27.99, headDmg: 54.61 },
    'The Jade Rabbit': { weaponType: 'Scout Rifle', bodyDmg: 42.04, headDmg: 84.5 },
    'Third Iteration': { weaponType: 'Scout Rifle', bodyDmg: 38.02, headDmg: 64.49 },
    'Touch of Malice': { weaponType: 'Scout Rifle', bodyDmg: 27.32, headDmg: 53.31 },
    'Wicked Implement': { weaponType: 'Scout Rifle', bodyDmg: 27.99, headDmg: 54.61 },
    'Buried Bloodline': { weaponType: 'Sidearm', bodyDmg: 42.3, headDmg: 75.89 },
    'Cryosthesia 77K': { weaponType: 'Sidearm', bodyDmg: 40.02, headDmg: 63.95 },
    "Devil's Ruin": { weaponType: 'Sidearm', bodyDmg: 36.02, headDmg: 57.56 },
    'Final Warning': { weaponType: 'Sidearm', bodyDmg: 25.19, headDmg: 40.26 },
    Forerunner: { weaponType: 'Sidearm', bodyDmg: 41.93, headDmg: 77.7 },
    'Rat King': { weaponType: 'Sidearm', bodyDmg: 25.02, headDmg: 39.98 },
    "Traveler's Chosen": { weaponType: 'Sidearm', bodyDmg: 36.03, headDmg: 57.57 },
    Trespasser: { weaponType: 'Sidearm', bodyDmg: 20.01, headDmg: 37.07, burstSize: 3 },
    'Barrow-Dyad': { weaponType: 'Submachine Gun', bodyDmg: 13.62, headDmg: 23.89 },
    'Osteo Striga': { weaponType: 'Submachine Gun', bodyDmg: 18.51, headDmg: 29.57 },
    Riskrunner: { weaponType: 'Submachine Gun', bodyDmg: 11.5, headDmg: 19.06 },
    Tarrabah: { weaponType: 'Submachine Gun', bodyDmg: 13.61, headDmg: 23.88 },
    'The Huckleberry': { weaponType: 'Submachine Gun', bodyDmg: 13.61, headDmg: 23.88 },
    'The Manticore': { weaponType: 'Submachine Gun', bodyDmg: 10.6, headDmg: 20.06 },
    "Ager's Scepter": { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Coldheart: { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Divinity: { weaponType: 'Trace Rifle', bodyDmg: 7.5, headDmg: 10.08 },
    Lodestar: { weaponType: 'Trace Rifle', bodyDmg: 12.76, headDmg: 17.13 },
    Microcosm: { weaponType: 'Trace Rifle', bodyDmg: 28.96, headDmg: 38.9 },
    'Prometheus Lens': { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    'Ruinous Effigy': { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    'The Navigator': { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Wavesplitter: { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Bastion: { weaponType: 'Fusion Rifle', bodyDmg: 30.6, headDmg: 30.6, isChargeTime: true, isFusion: true, boltsPerBurst: 3 },
    'Delicate Tomb': { weaponType: 'Fusion Rifle', bodyDmg: 16.99, headDmg: 16.99, isChargeTime: true, isFusion: true, boltsPerBurst: 9 },
    'Jötunn': { weaponType: 'Fusion Rifle', bodyDmg: 48, headDmg: 48, isChargeTime: true, isFusion: true, boltsPerBurst: 7 },
    Merciless: { weaponType: 'Fusion Rifle', bodyDmg: 79.22, headDmg: 79.22, isChargeTime: true, isFusion: true, boltsPerBurst: 5 },
    'One Thousand Voices': { weaponType: 'Fusion Rifle', bodyDmg: 79.22, headDmg: 79.22, isChargeTime: true, isFusion: true, boltsPerBurst: 5 },
    Telesto: { weaponType: 'Fusion Rifle', bodyDmg: 48, headDmg: 48, isChargeTime: true, isFusion: true, boltsPerBurst: 7 },
    Tessellation: { weaponType: 'Fusion Rifle', bodyDmg: 46.29, headDmg: 46.29, isChargeTime: true, isFusion: true, boltsPerBurst: 7 },
    'Vex Mythoclast': { weaponType: 'Fusion Rifle', bodyDmg: 22, headDmg: 39.48 },
    'Conditional Finality': { weaponType: 'Shotgun', bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
    Duality: { weaponType: 'Shotgun', bodyDmg: 23.09, headDmg: 25.58, isShotgun: true, pelletsPerShot: 12 },
    'Legend of Acrius': { weaponType: 'Shotgun', bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
    'Lord of Wolves': { weaponType: 'Shotgun', bodyDmg: 22.48, headDmg: 42.54 },
    "Slayer's Fang": { weaponType: 'Shotgun', bodyDmg: 170.1, headDmg: 298.51 },
    'The Chaperone': { weaponType: 'Shotgun', bodyDmg: 160.11, headDmg: 280.97 },
    'The Fourth Horseman': { weaponType: 'Shotgun', bodyDmg: 20, headDmg: 22.15, isShotgun: true, pelletsPerShot: 12 },
    'Tractor Cannon': { weaponType: 'Shotgun', bodyDmg: 23.01, headDmg: 25.49, isShotgun: true, pelletsPerShot: 12 },
    Borealis: { weaponType: 'Sniper Rifle', bodyDmg: 141.89, headDmg: 496.63 },
    Cloudstrike: { weaponType: 'Sniper Rifle', bodyDmg: 85.03, headDmg: 292.62 },
    'D.A.R.C.I.': { weaponType: 'Sniper Rifle', bodyDmg: 85.03, headDmg: 292.62 },
    'Ice Breaker': { weaponType: 'Sniper Rifle', bodyDmg: 141.89, headDmg: 496.63 },
    "Izanagi's Burden": { weaponType: 'Sniper Rifle', bodyDmg: 125.03, headDmg: 405.74 },
    'New Land Beyond': { weaponType: 'Sniper Rifle', bodyDmg: 155.09, headDmg: 427.25 },
    'Still Hunt': { weaponType: 'Sniper Rifle', bodyDmg: 125.03, headDmg: 405.74 },
    'Whisper of the Worm': { weaponType: 'Sniper Rifle', bodyDmg: 169.06, headDmg: 591.71 },
    Arbalest: { weaponType: 'Linear Fusion Rifle', bodyDmg: 132.07, headDmg: 568.42, isChargeTime: true },
    Euphony: { weaponType: 'Linear Fusion Rifle', bodyDmg: 39.2, headDmg: 134.9, isChargeTime: true },
    "Finality's Auger": { weaponType: 'Linear Fusion Rifle', bodyDmg: 78.4, headDmg: 269.79, isChargeTime: true },
    'Lorentz Driver': { weaponType: 'Linear Fusion Rifle', bodyDmg: 132.07, headDmg: 568.42, isChargeTime: true },
    'Sleeper Simulant': { weaponType: 'Linear Fusion Rifle', bodyDmg: 165.09, headDmg: 568.09, isChargeTime: true },
    'The Queenbreaker': { weaponType: 'Linear Fusion Rifle', bodyDmg: 165.09, headDmg: 568.09, isChargeTime: true },
    Alethonym: { weaponType: 'Grenade Launcher', bodyDmg: 129.24, headDmg: 129.24 },
    Anarchy: { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    'Dead Messenger': { weaponType: 'Grenade Launcher', bodyDmg: 139, headDmg: 139 },
    'Ex Diris': { weaponType: 'Grenade Launcher', bodyDmg: 143.83, headDmg: 143.83 },
    'Fighting Lion': { weaponType: 'Grenade Launcher', bodyDmg: 144.95, headDmg: 144.95 },
    Parasite: { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    "Salvation's Grip": { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    'The Colony': { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    'The Prospector': { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    Witherhoard: { weaponType: 'Grenade Launcher', bodyDmg: 143.83, headDmg: 143.83 },
    'Deterministic Chaos': { weaponType: 'Machine Gun', bodyDmg: 47.49, headDmg: 68.44 },
    'Grand Overture': { weaponType: 'Machine Gun', bodyDmg: 332.59, headDmg: 332.59 },
    'Heir Apparent': { weaponType: 'Machine Gun', bodyDmg: 25.53, headDmg: 33.29 },
    'Service of Luzaku': { weaponType: 'Machine Gun', bodyDmg: 47.49, headDmg: 68.44 },
    Thunderlord: { weaponType: 'Machine Gun', bodyDmg: 41.5, headDmg: 58.18 },
    Xenophage: { weaponType: 'Machine Gun', bodyDmg: 47.49, headDmg: 68.44 },
    'Edge of Action': { weaponType: 'Glaive', bodyDmg: 136.56, headDmg: 136.56 },
    'Edge of Concurrence': { weaponType: 'Glaive', bodyDmg: 120.85, headDmg: 120.85 },
    'Edge of Intent': { weaponType: 'Glaive', bodyDmg: 147.52, headDmg: 147.52 },
    Vexcalibur: { weaponType: 'Glaive', bodyDmg: 120.85, headDmg: 120.85 },
    Winterbite: { weaponType: 'Glaive', bodyDmg: 147.52, headDmg: 147.52 },
    "Eriana's Vow": { weaponType: 'Hand Cannon', bodyDmg: 77.04, headDmg: 162.32 },
    'The Lament': { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    'Black Talon': { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    Heartshadow: { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    Wolfsbane: { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    'Worldline Zero': { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    Deathbringer: { weaponType: 'Rocket Launcher', bodyDmg: 312, headDmg: 312 },
    "Dragon's Breath": { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    'Eyes of Tomorrow': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    Gjallarhorn: { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    'The Wardcliff Coil': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    Truth: { weaponType: 'Rocket Launcher', bodyDmg: 277, headDmg: 277 },
    'Two-Tailed Fox': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    'Whirling Ovation': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 }
  };
  var PVP_DISABLED = { 3201496230: 1, 1545231802: 1 };
  var PVP_STRIP_DMG = {};
  ['192157151', '2565067140', '3186078099', '1164602481', '3993379141', '1968497646',
    '3365897133', '1551736345', '1954620775', '1562897767', '3038247973', '64866129',
    '1866048759', '3118144663', '2416023159', '3050799639', '2450788523', '4207509907',
    '1583705720', '1409206216', '2883096192', '1782407750', '2241043034']
    .forEach(function (h) { PVP_STRIP_DMG[h] = 1; });
  function weaponsStatMods(val) {
    var clamped = Math.max(0, Math.min(100, Number(val) || 0));
    var a = clamped / 1000;
    return { percent: 100 * a, reloadDurationScale: 1 - a, handlingDurationScale: 1 - a };
  }
  function getTtkData(i, activeHashes) {
    var P = H.getP();
    var r = WR[i];
    if (!r) { return null; }
    var ty = TYPE_EN[typeName(r)] || typeName(r);
    var hash = String(r[W_H]), enName = P && P.en ? P.en[i] : null;
    if (ty === 'Sword') { return { bodyDmg: PVP_HP, headDmg: PVP_HP, assumedOneHit: true }; }
    if (ty === 'Fusion Rifle' && (hash === '2200470033' || enName === "Cull's Shadow")) {
      return Object.assign({}, PVP_FRAMES['Fusion Rifle']['Rapid Fire'], {
        modelAssumptions: ['Cull’s Shadow 按面板充能时间（基础 533ms）及速射融合伤害估算，未计腐化附加伤害。']
      });
    }
    if (ty === 'Shotgun' && (hash === '2699423382' || enName === 'MIDA Macro-Tool')) { return PVP_FRAMES.Shotgun.Precision; }
    if (ty === 'Auto Rifle' && (hash === '2694044463' || enName === 'Jiangshi AR1')) { return PVP_FRAMES['Auto Rifle'].Precision; }
    if (ty === 'Hand Cannon' && (['153979396', '2763843899', '3757612024', '2033531688'].indexOf(hash) !== -1 || enName === "Luna's Howl")) {
      return PVP_FRAMES['Hand Cannon'].Adaptive;
    }
    if (isExotic(r) && enName && PVP_EXOTICS[enName]) {
      var exo = PVP_EXOTICS[enName], k, base = {};
      for (k in exo) { if (Object.prototype.hasOwnProperty.call(exo, k) && k !== 'originTraitOverrides') { base[k] = exo[k]; } }
      if (exo.originTraitOverrides && activeHashes) {
        for (k = 0; k < activeHashes.length; k++) {
          var ov = exo.originTraitOverrides[activeHashes[k]];
          if (ov) { return Object.assign(base, ov); }
        }
      }
      return base;
    }
    var byType = PVP_FRAMES[ty];
    if (!byType) { return null; }
    var fk = frameKey(frameOf(r)[0]);
    var row = fk ? byType[fk] : null;
    if (!row) { return null; }
    if (!row.ammoTypeOverrides && !row.perkOverrides) { return row; }
    var out = {};
    for (k in row) { if (Object.prototype.hasOwnProperty.call(row, k) && k !== 'ammoTypeOverrides' && k !== 'perkOverrides') { out[k] = row[k]; } }
    var ammo = ammoEn(V.am[r[W_AMMO]][0]);
    if (row.ammoTypeOverrides && row.ammoTypeOverrides[ammo]) { Object.assign(out, row.ammoTypeOverrides[ammo]); }
    if (row.perkOverrides && activeHashes) {
      for (k = 0; k < activeHashes.length; k++) {
        if (row.perkOverrides[activeHashes[k]]) { Object.assign(out, row.perkOverrides[activeHashes[k]]); break; }
      }
    }
    return out;
  }
  function roundPvpDamage(n) {
    if (!Number.isFinite(n)) { return '—'; }
    var r = Math.round((n + Number.EPSILON) * 100) / 100;
    return r.toFixed(2);
  }
  function evalPerkStep(p, delta, ammo, baseMag, isFixed) {
    var P = H.getP();
    var h = P.p[p][P_HASH], spec = resolveAmmoSpec(perkSpec(p), ammo);
    var total = perkSteps(spec, p, ammo, baseMag);
    var cur = perkStepOf(p, ammo, false, isFixed);
    if (delta != null) { return delta; }
    if (cur > 0) { return cur - 1; }
    if (cur === 0) {
      if (spec && spec.overflow && Object.prototype.hasOwnProperty.call(CHECK_ONLY_PERKS, h)) { return -1; }
      return total > 1 ? -1 : -1;
    }
    return total > 0 ? total - 1 : 0;
  }
  function getPerkDamageModifier(spec, step, usePvp, perkHash, weaponTypeEn, ammoTypeEn) {
    var ph = String(perkHash);
    if (usePvp && PVP_DISABLED[ph]) { return null; }
    if (usePvp && PVP_CHRONO_PERKS[ph]) {
      var eff = Object.assign({}, PVP_CHRONO_PERKS[ph]);
      if (eff.kind === 'precisionInstrument') {
        eff.initialStacks = Math.max(0, Math.min(6, Math.floor(step) + 1));
        return { shotEffects: [eff], stepCount: 6 };
      }
      if (step < 0) { return null; }
      if (eff.kind === 'magnificentHowl') {
        eff.stacks = Math.max(1, Math.min(10, Math.floor(step) + 1));
        return { shotEffects: [eff], stepCount: 10 };
      }
      if (eff.kind === 'recombination') {
        var maxS = eff.enhanced ? 8 : 10;
        eff.stacks = Math.max(1, Math.min(maxS, Math.floor(step) + 1));
        return { shotEffects: [eff], stepCount: maxS };
      }
      if (eff.kind === 'onslaught') {
        eff.stacks = Math.max(1, Math.min(3, Math.floor(step) + 1));
        eff.delayScale = [0.833, 0.714, 0.625][eff.stacks - 1];
        return { shotEffects: [eff], stepCount: 3 };
      }
      if (eff.chronological) { eff.weaponType = weaponTypeEn; }
      if (eff.kind === 'cascadePoint') {
        eff.delayScale = (weaponTypeEn === 'Submachine Gun' || weaponTypeEn === 'Machine Gun') ? 0.7 : 0.6;
      }
      if (eff.kind === 'boxBreathing') {
        eff.precisionMultiplier = (weaponTypeEn === 'Scout Rifle' || weaponTypeEn === 'Glaive') ? 1.35
          : (weaponTypeEn === 'Sniper Rifle' && ammoTypeEn === 'Heavy') ? 1.3 : 1.4;
      }
      return { shotEffects: [eff] };
    }
    if (!spec) { return null; }
    var raw = {}, k;
    for (k in spec) {
      if (!Object.prototype.hasOwnProperty.call(spec, k)) { continue; }
      if (usePvp && PVP_STRIP_DMG[ph] && /dmg/i.test(k)) { continue; }
      raw[k] = spec[k];
    }
    var out = {}, hasAny = false;
    var p = usePvp && raw.pvpDmg != null ? raw.pvpDmg : raw.dmg;
    if (p != null) { out.dmg = pickStep(p, step, ammoTypeEn); hasAny = true; }
    if (raw.precDmg != null) { out.precDmg = pickStep(raw.precDmg, step, ammoTypeEn); hasAny = true; }
    if (raw.precDmgByType != null) { out.precDmgByType = raw.precDmgByType; hasAny = true; }
    if (raw.heavyPrecDmgByType != null) { out.heavyPrecDmgByType = raw.heavyPrecDmgByType; hasAny = true; }
    if (raw.rpmMod != null) { out.rpmMod = pickStep(raw.rpmMod, step, ammoTypeEn); hasAny = true; }
    if (raw.rpmModByType != null) { out.rpmModByType = raw.rpmModByType; hasAny = true; }
    if (raw.dmgByType != null) { out.dmgByType = raw.dmgByType; hasAny = true; }
    if (raw.blastDmgByType != null) { out.blastDmgByType = raw.blastDmgByType; hasAny = true; }
    if (raw.chargeTimeMod != null) { out.chargeTimeMod = raw.chargeTimeMod; hasAny = true; }
    if (raw.reloadDurationMod != null) { out.reloadDurationMod = pickStep(raw.reloadDurationMod, step, ammoTypeEn); hasAny = true; }
    return hasAny ? out : null;
  }
  function isRpmEffect(eff) {
    return eff.kind === 'cascadePoint' || eff.kind === 'desperado' || eff.kind === 'onslaught';
  }
  function rpmEffectDuration(eff) {
    return eff.kind === 'onslaught' ? (eff.enhanced ? 5 : 4.5)
      : eff.kind === 'desperado' ? (eff.enhanced ? 7 : 6)
        : (eff.enhanced ? 2.75 : 2.5);
  }
  function evalShotPerkEffect(eff, state, ctx, weaponCtx) {
    if (eff.kind === 'recombination') {
      var active = !(state && state.consumed && (ctx.shot == null || ctx.shot !== state.firstShot)) && ctx.hit !== false;
      return {
        multiplier: active ? 1 + eff.stacks * (eff.enhanced ? 0.0625 : 0.05) : 1,
        state: { consumed: true, firstShot: state && state.consumed ? state.firstShot : ctx.shot }
      };
    }
    if (eff.kind === 'magnificentHowl') {
      var sh = ctx.shot != null ? ctx.shot : (state && state.shots) || 0;
      return {
        multiplier: sh < eff.stacks && ctx.hit !== false ? (eff.enhanced ? 1.55 : 1.5) : 1,
        state: { shots: sh + 1 }
      };
    }
    if (eff.kind === 'oneForAll') { return { multiplier: ctx.time + PVP_EPS < (eff.enhanced ? 11 : 10) ? 1.35 : 1, state: {} }; }
    if (eff.kind === 'harmony') { return { multiplier: ctx.time + PVP_EPS < (eff.enhanced ? 8 : 7) ? 1.2 : 1, state: {} }; }
    if (eff.kind === 'killClip') { return { multiplier: ctx.time + PVP_EPS < (eff.enhanced ? 5.5 : 5) ? 1.25 : 1, state: {} }; }
    if (isRpmEffect(eff)) { return { multiplier: 1, state: {} }; }
    if (eff.kind === 'reservoirBurst') {
      var ok = Number.isFinite(weaponCtx.magazineCapacity) && weaponCtx.magazineCapacity >= 1 &&
        Number.isFinite(ctx.remainingAmmo) && ctx.remainingAmmo >= weaponCtx.magazineCapacity;
      return { multiplier: ok ? (eff.enhanced ? 1.33 : 1.3) : 1, state: {} };
    }
    if (eff.kind === 'highImpactReserves') {
      var rem = ctx.remainingAmmo, cap = weaponCtx.magazineCapacity;
      if (!Number.isFinite(rem) || rem < 1 || !Number.isFinite(cap) || cap < 1) { return { multiplier: 1, state: {} }; }
      var thresh = cap * (eff.enhanced ? 0.55 : 0.5);
      if (rem > thresh + PVP_EPS) { return { multiplier: 1, state: {} }; }
      var frac = thresh <= 1 ? 1 : Math.min(1, Math.max(0, (thresh - rem) / (thresh - 1)));
      return { multiplier: 1.03 + 0.03 * frac, state: {} };
    }
    if (eff.kind === 'boxBreathing') {
      return { multiplier: (state && state.consumed) || ctx.hit === false ? 1 : eff.precisionMultiplier, state: { consumed: true } };
    }
    var n = Object.assign({
      hits: eff.kind === 'precisionInstrument' && eff.initialStacks ? eff.initialStacks : 0,
      lastHit: eff.kind === 'precisionInstrument' && eff.initialStacks ? 0 : null,
      lastBurst: null
    }, state || {});
    var win = eff.kind === 'targetLock' ? 0.2 : (weaponCtx.isChargeTime || weaponCtx.isBow) ? 2.1 : 1.25;
    if ((ctx.reload && !(weaponCtx.isBow && eff.kind === 'precisionInstrument')) ||
      (n.lastHit != null && ctx.time - n.lastHit > win + PVP_EPS)) {
      n.hits = 0; n.lastBurst = null;
    }
    if (ctx.hit === false) { return { multiplier: 1, state: { hits: 0, lastHit: null, lastBurst: null } }; }
    var mult;
    if (eff.kind === 'targetLock') {
      var tlCap = weaponCtx.magazineCapacity;
      if (!Number.isFinite(tlCap) || tlCap <= 0) { mult = 1; }
      else {
        var r = Math.max(0, n.hits) / tlCap;
        if (r + PVP_EPS < 0.125) { mult = 1; }
        else {
          var x = (Math.min(r, 1.1) + 0.35) / 1.482;
          mult = 1 + (0.0915 + 0.30901 * (3 * x * x - 2 * x * x * x)) * 0.625 * (eff.enhanced ? 1.2 : 1);
        }
      }
    } else {
      mult = 1 + Math.min(6, n.hits) * (eff.enhanced ? 0.3 : 0.25) / 6;
    }
    if (eff.kind !== 'precisionInstrument' || !weaponCtx.heavyBurst || n.lastBurst !== ctx.burst) { n.hits++; }
    n.lastHit = ctx.time;
    n.lastBurst = ctx.burst;
    return { multiplier: mult, state: n };
  }
  function firingInterval(w, effects, time, magShot) {
    if (w.isChargeTime || w.isBow) { return w.rpm / 1000; }
    var burst = w.burstSize || 1, intra = w.intraBurstDelay || PVP_INTRA_BURST;
    var scale = effects.filter(isRpmEffect).reduce(function (acc, eff) {
      return acc * (time + PVP_EPS < rpmEffectDuration(eff) ? eff.delayScale : 1);
    }, 1);
    if (burst > 1) {
      return magShot % burst !== 0 ? intra : Math.max(0, 60 * (w.rpmPerBurst ? 1 : burst) / w.rpm * scale - (burst - 1) * intra);
    }
    return 60 / w.rpm * scale;
  }
  function resolveReloadSec(ctx, effects, time) {
    if (Number.isFinite(ctx.afterHitReloadSeconds)) { return ctx.afterHitReloadSeconds; }
    var ons = null;
    for (var i = 0; i < effects.length; i++) { if (effects[i].kind === 'onslaught') { ons = effects[i]; break; } }
    if (ons && time + PVP_EPS >= rpmEffectDuration(ons) && Number.isFinite(ctx.expiredOnslaughtReloadSeconds)) {
      return ctx.expiredOnslaughtReloadSeconds;
    }
    return ctx.reloadSeconds;
  }
  function shotTimeAt(shotNum, rpm, w) {
    if (!rpm) { return null; }
    if (w.isBow) { return rpm / 1000 * (shotNum - 1); }
    if (w.isChargeTime) { return rpm / 1000 * shotNum; }
    var b = w.burstSize || 1;
    if (b > 1) {
      var intra = w.intraBurstDelay || PVP_INTRA_BURST;
      var burstIdx = Math.floor((shotNum - 1) / b);
      return 60 * (w.rpmPerBurst ? 1 : b) / rpm * burstIdx + (shotNum - 1) % b * intra;
    }
    return 60 / rpm * (shotNum - 1);
  }
  function withHitAssumption(res, hp) {
    var first = res && res.shotSequence && res.shotSequence[0];
    if (first && !first.crit && res.crits && res.bodies && !(first.headDmg + PVP_EPS < hp)) {
      var a = (res.shotAssumptions || []).slice();
      var msg = '当前精准率下假定首发射击为非精准；若首发射击命中精准将一击击杀。';
      if (a.indexOf(msg) === -1) { a.push(msg); }
      return Object.assign({}, res, { shotAssumptions: a });
    }
    return res;
  }
  function simAreaDenial(w, mod, hp) {
    var ad = w.areaDenial, ctx = Object.assign({}, w, (mod && mod.shotContext) || {});
    var effects = (mod && mod.shotEffects) || [];
    if (!Number.isFinite(w.rpm) || w.rpm <= 0) { return null; }
    if (effects.some(function (e) { return e.kind !== 'harmony' && e.kind !== 'oneForAll' && e.kind !== 'adagio'; })) { return null; }
    var cap = Math.max(1, Math.floor(ctx.magazineCapacity || 1));
    var load = Math.max(1, Math.floor(ctx.loadedMagazine || cap));
    var nextShot = 0, nextTick = Infinity, tickEnd = -Infinity, totalDmg = 0;
    var reloads = 0, reloadSum = 0, pendingReload = null, activations = [], pulls = 0, seq = [];
    var dmgScale = w.bodyDmg / ad.projectileDamage * ((mod && mod.blastDmg != null) ? mod.blastDmg : 1);
    function pushEvt(t, baseDmg, label, relSec) {
      var mult = effects.reduce(function (m, eff) {
        if (eff.kind === 'adagio') { return m * (t + PVP_EPS < (eff.enhanced ? 8 : 7) ? 1.3 : 1); }
        return m * evalShotPerkEffect(eff, {}, { time: t }, ctx).multiplier;
      }, 1);
      var d = baseDmg * dmgScale * mult;
      totalDmg += d;
      seq.push({ time: t, crit: false, bodyDmg: d, headDmg: d, label: label, reloadSeconds: relSec || 0, remainingAmmo: load, trigger: pulls });
      return totalDmg + PVP_EPS >= hp;
    }
    while (seq.length < 1000) {
      var actAt = activations.length ? activations[0] : Infinity;
      var earliest = Math.min(nextShot, nextTick, actAt);
      if (!Number.isFinite(earliest)) { return null; }
      if (actAt <= Math.min(nextShot, nextTick)) {
        activations.shift();
        if (nextTick > tickEnd + PVP_EPS) { nextTick = actAt; }
        tickEnd = Math.max(tickEnd, actAt + (ad.ticks - 1) * ad.tickInterval);
        continue;
      }
      if (nextShot <= nextTick) {
        var tShot = nextShot;
        pulls++;
        if (pendingReload != null) { reloads++; reloadSum += pendingReload; load = cap; }
        for (var p = 0; p < ad.projectiles; p++) {
          if (pushEvt(tShot, ad.projectileDamage, 'Projectile', p === 0 ? pendingReload || 0 : 0)) { break; }
        }
        if (totalDmg + PVP_EPS >= hp) { break; }
        activations.push(tShot + ad.activationDelay);
        pendingReload = null;
        if (--load === 0) {
          pendingReload = resolveReloadSec(ctx, effects, tShot);
          if (!Number.isFinite(pendingReload) || pendingReload < 0) { nextShot = Infinity; continue; }
        }
        var tReady = tShot + (pendingReload || 0), step = 60 / w.rpm;
        for (var a = 0; a < effects.length; a++) {
          if (effects[a].kind === 'adagio' && tReady + PVP_EPS < (effects[a].enhanced ? 8 : 7)) { step *= 1.2; break; }
        }
        nextShot = tReady + step;
      } else {
        if (nextTick > tickEnd + PVP_EPS) { nextTick = Infinity; continue; }
        if (pushEvt(nextTick, ad.tickDamage, 'Pool tick', 0)) { break; }
        nextTick += ad.tickInterval;
      }
    }
    if (totalDmg + PVP_EPS < hp) { return null; }
    var m = seq.length;
    return {
      shots: m, crits: 0, bodies: m, damage: totalDmg,
      ttk: Math.round(1000 * seq[m - 1].time) / 1000, optimal: m + 'b', critPercent: 0,
      rpm: w.rpm, bodyDmg: totalDmg / m, headDmg: totalDmg / m, reloadCount: reloads, reloadTime: reloadSum,
      shotSequence: seq, areaDenial: true, triggerPulls: pulls
    };
  }
  function simStatefulDp(w, mod, hp, acc, forced) {
    var ctx = Object.assign({}, w, (mod && mod.shotContext) || {}), effects = (mod && mod.shotEffects) || [];
    var adjAcc = w.headDmg <= w.bodyDmg && acc != null ? 0 : acc;
    var cap = Number.isFinite(ctx.magazineCapacity) && ctx.magazineCapacity >= 1 ? Math.floor(ctx.magazineCapacity) : null;
    if (!Number.isFinite(w.rpm) || w.rpm <= 0) { return null; }
    if (!cap && effects.some(function (e) { return e.kind === 'focusedFury' || e.kind === 'targetLock' || e.kind === 'highImpactReserves' || e.kind === 'reservoirBurst'; })) {
      return null;
    }
    var initLoad = Number.isFinite(ctx.loadedMagazine) && ctx.loadedMagazine >= 1 ? Math.floor(ctx.loadedMagazine) : cap;
    var unit = w.chargeBurstSize || (w.ammoPerBurst ? w.burstSize : w.pelletsPerShot || 1);
    var burst = w.burstSize || 1;
    var frontier = [{ time: 0, damage: 0, crits: 0, magazineShot: 0, load: initLoad, reloads: 0, states: effects.map(function () { return {}; }), sequence: [] }];
    var best = null, limit = forced ? forced.shots : 100;
    for (var t = 0; t < limit && frontier.length; t++) {
      var bucket = {};
      for (var f = 0; f < frontier.length; f++) {
        var u = frontier[f];
        var needRel = t % unit === 0 && !w.isBow && u.load != null && u.magazineShot >= u.load;
        var newUnit = t > 0 && t % unit === 0;
        var missedTail = newUnit && w.missedBurstTail ? w.missedBurstTail : 0;
        var relSec = needRel ? resolveReloadSec(ctx, effects, u.time + missedTail) : 0;
        if (needRel && (!Number.isFinite(relSec) || relSec < 0)) { continue; }
        var magPos = needRel ? 0 : u.magazineShot;
        var curLoad = needRel ? cap : u.load;
        var baseT = u.time + missedTail + relSec + (newUnit && !needRel && w.chargeRecovery ? w.chargeRecovery : 0);
        var delay = 0;
        if (t === 0) {
          delay = w.isChargeTime && !w.isBow ? w.rpm / 1000 : 0;
        } else if ((w.chargeBurstSize || w.ammoPerBurst) && t % unit !== 0) {
          delay = (t % unit) % (w.boltsPerGroup || 1) === 0 ? w.intraBurstDelay || PVP_INTRA_BURST : 0;
        } else if (w.pelletsPerShot && t % unit !== 0) {
          delay = 0;
        } else {
          delay = (w.isChargeTime && !w.isBow) ? w.rpm / 1000
            : (burst > 1)
              ? ((t / unit) % burst !== 0 ? (w.intraBurstDelay || PVP_INTRA_BURST)
                : Math.max(0, 60 * (w.rpmPerBurst ? 1 : burst) / w.rpm - (burst - 1) * (w.intraBurstDelay || PVP_INTRA_BURST)))
              : (w.isBow ? w.rpm / 1000 : 60 / w.rpm);
        }
        for (var a = 0; a < effects.length; a++) {
          if (w.chargeBurstSize && t % unit !== 0) { continue; }
          var eff = effects[a], est = u.states[a];
          var live = function (until, cur) { return until != null && cur + PVP_EPS < until; };
          if ((w.isChargeTime || w.isBow) && eff.kind === 'backupPlan' && live(eff.enhanced ? 2.5 : 2, baseT)) { delay *= 0.7; }
          if ((w.isChargeTime || w.isBow) && eff.kind === 'kickstart') { delay *= 0.8; }
          if ((w.isChargeTime || w.isBow) && eff.kind === 'successfulWarmup' && live(6, baseT)) { delay *= 0.625; }
          if ((w.isChargeTime || w.isBow) && eff.kind === 'controlledBurst' && live(est.until, baseT)) { delay *= 0.9; }
          if (w.isBow && eff.kind === 'archersTempo' && live(est.until, baseT)) { delay *= 0.75; }
          if (w.isBow && eff.kind === 'archersGambit' && live(est.until, baseT)) { delay *= 0.4; }
          if (eff.kind === 'adagio' && live(eff.enhanced ? 8 : 7, baseT)) { delay *= 1.2; }
        }
        var hitT = baseT + delay;
        if (best && hitT > best.time + PVP_EPS) { continue; }
        var critChoices = forced ? [t < forced.crits] : (w.headDmg <= w.bodyDmg || adjAcc === 0 ? [false] : adjAcc === 100 ? [true] : [false, true]);
        for (var ci = 0; ci < critChoices.length; ci++) {
          var isCrit = critChoices[ci];
          var nextStates = effects.map(function (_, idx) { return Object.assign({}, u.states[idx]); });
          var bDmg = w.bodyDmg, hDmg = w.headDmg;
          var blastPart = w.impactDmg == null ? 0 : Math.max(0, bDmg - w.impactDmg);
          function scaleDmg(mult, noBlast, blastOnly) {
            if (blastOnly) { bDmg += blastPart * (mult - 1); hDmg += blastPart * (mult - 1); blastPart *= mult; }
            else if (noBlast) { bDmg += (bDmg - blastPart) * (mult - 1); hDmg += (hDmg - blastPart) * (mult - 1); }
            else { bDmg *= mult; hDmg *= mult; blastPart *= mult; }
          }
          for (var ei = 0; ei < effects.length; ei++) {
            var ef = effects[ei], st = nextStates[ei], kd = ef.kind;
            var isLive = function (until, cur) { return until != null && cur + PVP_EPS < until; };
            if (kd === 'focusedFury') {
              if (needRel) { st.count = 0; }
              if (isLive(st.until, hitT)) { scaleDmg(1.25, true, false); }
              if (isCrit) { st.count = (st.count || 0) + 1; if (st.count >= Math.ceil(0.35 * cap)) { st.until = hitT + (ef.enhanced ? 12 : 11); st.count = 0; } }
            } else if (kd === 'archersTempo' || kd === 'archersGambit') {
              if (isCrit && w.isBow) {
                st.until = kd === 'archersTempo' ? hitT + (ef.enhanced ? 4 : 3)
                  : (isLive(st.until, hitT) ? Math.min(hitT + 8, st.until + 4) : hitT + (ef.enhanced ? 5 : 4));
              }
            } else if (kd === 'controlledBurst') {
              if (isLive(st.until, hitT)) { scaleDmg(1.2, false, false); }
              if (w.isFusion && w.hitBolts === w.boltsPerBurst && (!w.fusionTiming || (t + 1) % unit === 0)) {
                st.until = hitT + (ef.enhanced ? 2.5 : 2);
              }
            } else if (kd === 'backupPlan') {
              if (isLive(ef.enhanced ? 2.5 : 2, hitT)) { scaleDmg(0.8, false, false); }
            } else if (kd === 'kickstart') {
              scaleDmg(1.15, false, false);
            } else if (kd === 'adagio') {
              if (isLive(ef.enhanced ? 8 : 7, hitT)) { scaleDmg(ef.weaponType === 'Hand Cannon' ? 1.27 : 1.3, false, false); }
            } else if (kd === 'bluntExecution') {
              if (t < (w.ammoPerBurst ? unit : burst * unit) && isLive(ef.enhanced ? 11 : 10, hitT)) { scaleDmg(2, false, false); }
            } else if (kd === 'explosiveLight') {
              if (Math.floor(t / unit) < (ef.enhanced ? 7 : 6)) {
                if (ef.weaponType === 'Rocket Launcher') { scaleDmg(1.25, false, false); }
                else if (ef.weaponType === 'Grenade Launcher') { scaleDmg(1.6, false, true); }
              }
            } else if (kd !== 'successfulWarmup') {
              var ev = evalShotPerkEffect(ef, st, {
                time: hitT, reload: needRel, shot: Math.floor(t / unit),
                remainingAmmo: curLoad == null ? null : curLoad - magPos, hit: true,
                burst: w.ammoPerBurst ? magPos : Math.floor(magPos / (w.burstSize || (ctx.heavyBurst ? 2 : 1)))
              }, ctx);
              nextStates[ei] = ev.state;
              if (kd === 'precisionInstrument' || kd === 'boxBreathing') { hDmg *= ev.multiplier; }
              else { scaleDmg(ev.multiplier, kd === 'highImpactReserves' || kd === 'killClip', false); }
            }
          }
          var stepNode = {
            time: hitT, crit: isCrit, bodyDmg: bDmg, headDmg: hDmg,
            remainingAmmo: curLoad == null ? null : curLoad - magPos, reloadSeconds: relSec
          };
          var nextNode = {
            time: hitT, damage: u.damage + (isCrit ? hDmg : bDmg), crits: u.crits + (isCrit ? 1 : 0),
            magazineShot: magPos + ((t + 1) % unit === 0 ? 1 : 0), load: curLoad,
            reloads: u.reloads + (needRel ? 1 : 0), states: nextStates, sequence: u.sequence.concat([stepNode])
          };
          var accOk = adjAcc == null || nextNode.crits === Math.round((t + 1) * Math.max(0, Math.min(100, adjAcc)) / 100);
          if (nextNode.damage + PVP_EPS >= hp) {
            if (accOk && (!best || hitT < best.time - PVP_EPS || (Math.abs(hitT - best.time) <= PVP_EPS && nextNode.crits < best.crits))) {
              best = nextNode;
            }
            continue;
          }
          if (best && hitT >= best.time - PVP_EPS && !w.isShotgun) { continue; }
          nextStates.forEach(function (st) { if (st.until != null && st.until <= hitT + PVP_EPS) { delete st.until; } });
          var key = JSON.stringify([nextNode.crits, hitT, nextNode.magazineShot, nextNode.load, nextStates]);
          if (!bucket[key] || bucket[key].damage < nextNode.damage) { bucket[key] = nextNode; }
        }
      }
      frontier = Object.keys(bucket).map(function (k) { return bucket[k]; });
    }
    if (!best) { return null; }
    var uLen = best.sequence.length, bCnt = uLen - best.crits;
    if (!forced && best.crits > 0 && bCnt > 0) {
      var alt = simStatefulDp(w, mod, hp, adjAcc, { shots: uLen, crits: best.crits });
      if (alt && alt.shots === uLen && alt.crits === best.crits && Math.abs(alt.shotSequence[alt.shotSequence.length - 1].time - best.time) <= PVP_EPS) {
        return alt;
      }
    }
    var relTotal = best.sequence.reduce(function (s, x) { return s + x.reloadSeconds; }, 0);
    var resObj = {
      shots: uLen, crits: best.crits, bodies: bCnt, damage: best.damage,
      ttk: Math.round(1000 * best.time) / 1000,
      optimal: best.crits ? best.crits + 'h' + bCnt + 'b' : bCnt + 'b',
      critPercent: Math.round(100 * best.crits / uLen), rpm: w.rpm,
      bodyDmg: best.sequence.reduce(function (s, x) { return s + x.bodyDmg; }, 0) / uLen,
      headDmg: best.sequence.reduce(function (s, x) { return s + x.headDmg; }, 0) / uLen,
      reloadCount: best.reloads, reloadTime: relTotal, shotSequence: best.sequence
    };
    if (w.isBow) { resObj.hits = uLen; }
    if (w.ammoPerBurst) { resObj.bursts = Math.ceil(uLen / unit); resObj.ammoConsumed = Math.ceil(uLen / unit); }
    if (w.isShotgun) { resObj.isShotgun = true; resObj.pelletsToKill = uLen; resObj.pelletsPerShot = unit; }
    return resObj;
  }
  function simShotSeq(w, mod, hp, acc) {
    if (w.chargeBurstSize || w.ammoPerBurst || (mod && mod.shotEffects && mod.shotEffects.some(function (e) { return e.chronological; }))) {
      return simStatefulDp(w, mod, hp, acc, null);
    }
    var bDmg = w.bodyDmg, hDmg = w.headDmg, rpm = w.rpm;
    if (!Number.isFinite(rpm) || rpm <= 0) { return null; }
    var ctx = Object.assign({}, w, (mod && mod.shotContext) || {});
    var effects = (mod && mod.shotEffects) || [], hasRpmEff = effects.some(isRpmEffect);
    var cap = Number.isFinite(ctx.magazineCapacity) && ctx.magazineCapacity > 0 ? Math.floor(ctx.magazineCapacity) : null;
    if (cap == null && effects.some(function (e) { return e.kind === 'targetLock' || e.kind === 'highImpactReserves' || e.kind === 'reservoirBurst'; })) {
      return null;
    }
    var initLoad = Number.isFinite(ctx.loadedMagazine) && ctx.loadedMagazine > 0 ? Math.floor(ctx.loadedMagazine) : cap;
    var curLoad = initLoad, states = effects.map(function () { return {}; }), seq = [];
    var unit = w.pelletsPerShot || 1, sumBody = 0, magPos = 0, segT0 = 0, relCnt = 0;
    for (var g = 0; g < 100; g++) {
      var needRel = g % unit === 0 && !w.isBow && initLoad != null && magPos >= curLoad;
      var relSec = needRel ? resolveReloadSec(ctx, effects, seq[g - 1].time) : 0;
      if (needRel) {
        if (!Number.isFinite(relSec) || relSec < 0) { return null; }
        relCnt++;
        segT0 = seq[g - 1].time + relSec;
        magPos = 0;
        curLoad = cap;
        if (!w.isChargeTime) { segT0 += 60 / rpm; }
      }
      var tHit = segT0 + shotTimeAt(magPos + 1, rpm, w);
      if (hasRpmEff && g > 0) {
        var prevT = seq[g - 1].time;
        if (g % unit !== 0) { tHit = prevT; }
        else { var tBase = prevT + relSec; tHit = tBase + firingInterval(needRel ? Object.assign({}, w, { burstSize: 1 }) : w, effects, tBase, magPos); }
      }
      var x = bDmg, h = hDmg, blastPart = w.impactDmg != null ? Math.max(0, bDmg - w.impactDmg) : 0;
      var remAmmo = curLoad == null ? null : curLoad - magPos;
      for (var ei = 0; ei < effects.length; ei++) {
        var ef = effects[ei], ev = evalShotPerkEffect(ef, states[ei], {
          time: tHit, reload: needRel, remainingAmmo: remAmmo, shot: Math.floor(g / unit),
          hit: true, burst: Math.floor(magPos / (w.burstSize || (ctx.heavyBurst ? 2 : 1)))
        }, ctx);
        states[ei] = ev.state;
        if (ef.kind === 'magnificentHowl' || ef.kind === 'recombination' || ef.kind === 'targetLock' ||
          ef.kind === 'reservoirBurst' || ef.kind === 'harmony' || ef.kind === 'oneForAll') {
          x *= ev.multiplier; h *= ev.multiplier; blastPart *= ev.multiplier;
        } else if (ef.kind === 'highImpactReserves' || ef.kind === 'killClip') {
          x += (x - blastPart) * (ev.multiplier - 1); h += (h - blastPart) * (ev.multiplier - 1);
        } else {
          h *= ev.multiplier;
        }
      }
      seq.push({ time: tHit, bodyDmg: x, headDmg: h, remainingAmmo: remAmmo, reloadSeconds: relSec });
      sumBody += x;
      if ((g + 1) % unit === 0) { magPos++; }
      var deltas = seq.map(function (s, idx) { return { i: idx, delta: s.headDmg - s.bodyDmg }; })
        .sort(function (a, b) { return b.delta - a.delta; });
      var crits = acc == null ? 0 : Math.round(seq.length * Math.max(0, Math.min(100, acc)) / 100);
      var tot = sumBody + deltas.slice(0, crits).reduce(function (s, d) { return s + d.delta; }, 0);
      if (acc == null) {
        while (tot + PVP_EPS < hp && crits < seq.length) { tot += deltas[crits++].delta; }
      }
      if (tot + PVP_EPS < hp) { continue; }
      var seqTot = sumBody + seq.slice(0, crits).reduce(function (s, q) { return s + q.headDmg - q.bodyDmg; }, 0);
      var useHeadFirst = seqTot + PVP_EPS >= hp;
      var critSet = {};
      if (useHeadFirst) { for (var si = 0; si < crits; si++) { critSet[si] = 1; } }
      else { for (var di = 0; di < crits; di++) { critSet[deltas[di].i] = 1; } }
      if (useHeadFirst) { tot = seqTot; }
      var running = 0;
      for (var pi = 0; pi < seq.length - 1; pi++) {
        running += critSet[pi] ? seq[pi].headDmg : seq[pi].bodyDmg;
        if (running + PVP_EPS >= hp) { return simStatefulDp(w, mod, hp, acc, null); }
      }
      var bodies = seq.length - crits;
      var relTime = seq.reduce(function (s, q) { return s + q.reloadSeconds; }, 0);
      var out = {
        shots: seq.length, crits: crits, bodies: bodies, damage: tot,
        reloadCount: relCnt, reloadTime: relTime,
        ttk: Math.round(1000 * tHit) / 1000,
        optimal: crits === 0 ? bodies + 'b' : crits + 'h' + bodies + 'b',
        critPercent: Math.round(100 * crits / seq.length), rpm: rpm,
        bodyDmg: sumBody / seq.length,
        headDmg: seq.reduce(function (s, q) { return s + q.headDmg; }, 0) / seq.length,
        shotSequence: seq.map(function (q, idx) { return Object.assign({}, q, { crit: !!critSet[idx] }); })
      };
      if (w.isBow) { out.hits = seq.length; }
      if (w.isShotgun) { out.isShotgun = true; out.pelletsToKill = seq.length; out.pelletsPerShot = w.pelletsPerShot; }
      return out;
    }
    return null;
  }
  function simFusionBolts(w, mod, hp, acc) {
    var totalBolts = w.boltsPerBurst;
    var targetBolts = acc == null ? null : Math.round(totalBolts * Math.max(0, Math.min(100, acc)) / 100);
    if (targetBolts === 0) { return null; }
    var lo = targetBolts != null ? targetBolts : 1, hi = targetBolts != null ? targetBolts : totalBolts;
    var best = null;
    for (var o = lo; o <= hi; o++) {
      if (w.fusionTiming) {
        var ft = w.fusionTiming;
        var wMod = Object.assign({}, w, {
          headDmg: w.bodyDmg, hitBolts: o, chargeBurstSize: o, intraBurstDelay: ft.boltInterval,
          boltsPerGroup: ft.boltsPerGroup, chargeRecovery: ft.recovery,
          missedBurstTail: (Math.floor((totalBolts - 1) / ft.boltsPerGroup) - Math.floor((o - 1) / ft.boltsPerGroup)) * ft.boltInterval
        });
        var l = simStatefulDp(wMod, mod || {}, hp, 0, null);
        if (!l) { continue; }
        var bursts = Math.ceil(l.shots / o);
        if (best && (l.ttk > best.ttk || (l.ttk === best.ttk && o >= best.hitBolts))) { continue; }
        best = Object.assign({}, l, {
          bursts: bursts, hitBolts: o, optimal: o + 'b',
          critPercent: o === totalBolts ? 100 : Math.ceil((o - 0.5) * 100 / totalBolts)
        });
        continue;
      }
      var yRes = simShotSeq(Object.assign({}, w, { bodyDmg: w.bodyDmg * o, headDmg: w.bodyDmg * o, hitBolts: o }), mod || {}, hp, 0);
      if (!yRes) { continue; }
      var yBursts = yRes.shots;
      if (best && (yRes.ttk > best.ttk || (yRes.ttk === best.ttk && yBursts >= best.bursts))) { continue; }
      var sum = 0, flatSeq = [];
      for (var bi = 0; bi < yRes.shotSequence.length; bi++) {
        var bEntry = yRes.shotSequence[bi];
        for (var k = 0; k < o && sum + PVP_EPS < hp; k++) {
          var boltDmg = bEntry.bodyDmg / o;
          sum += boltDmg;
          flatSeq.push({ time: bEntry.time, bodyDmg: boltDmg, headDmg: boltDmg, remainingAmmo: bEntry.remainingAmmo, burst: bi + 1, reloadSeconds: k === 0 ? bEntry.reloadSeconds : 0, crit: false });
        }
      }
      best = Object.assign({}, yRes, {
        bursts: yBursts, shots: flatSeq.length, crits: 0, bodies: flatSeq.length,
        optimal: o + 'b', critPercent: o === totalBolts ? 100 : Math.ceil((o - 0.5) * 100 / totalBolts),
        bodyDmg: sum / flatSeq.length, headDmg: sum / flatSeq.length, damage: sum, shotSequence: flatSeq
      });
    }
    return best;
  }
  function applyScalarTtkMods(w, mod, weaponStat) {
    var b = w.bodyDmg, h = w.headDmg, rpm = w.rpm, imp = w.impactDmg;
    var ws = weaponStat == null ? 0 : weaponStat;
    if (ws > 100) {
      var wsScale = 1 + 5e-4 * Math.max(0, ws - 100);
      b *= wsScale; h *= wsScale;
      if (imp != null) { imp *= wsScale; }
    }
    if (mod && mod.dmg != null) { b *= mod.dmg; h *= mod.dmg; if (imp != null) { imp *= mod.dmg; } }
    if (mod && mod.blastDmg != null && imp != null) { var add = (b - imp) * (mod.blastDmg - 1); b += add; h += add; }
    if (mod && mod.precDmg != null) { h *= mod.precDmg; }
    if (mod && mod.rpmMod != null && !w.isChargeTime) { rpm /= mod.rpmMod; }
    if (mod && mod.chargeTimeMod != null && w.isChargeTime) { rpm *= mod.chargeTimeMod; }
    return { bodyDmg: b, headDmg: h, rpm: rpm, impactDmg: imp };
  }
  function calculateOptimalKill(w, mod, hp, weaponStat) {
    hp = hp == null ? PVP_HP : hp;
    weaponStat = weaponStat == null ? 0 : weaponStat;
    if (!w || !w.bodyDmg) { return null; }
    if (w.assumedOneHit) {
      return { shots: 1, crits: 0, bodies: 1, ttk: 0, optimal: '1b', critPercent: 0, bodyDmg: hp, headDmg: hp, damage: hp, reloadCount: 0, reloadTime: 0, shotSequence: [{ time: 0, crit: false, bodyDmg: hp, headDmg: hp }] };
    }
    if (w.hitCountOnly) {
      var hcMod = mod ? { dmg: mod.dmg, precDmg: mod.precDmg, blastDmg: mod.blastDmg } : null;
      var hcW = Object.assign({}, w, { hitCountOnly: false, rpm: undefined });
      var hcRes = calculateOptimalKill(hcW, hcMod, hp, weaponStat);
      return hcRes ? Object.assign({}, hcRes, { hitCountOnly: true, ttk: hcRes.shots === 1 ? 0 : null, shotSequence: [], reloadCount: null }) : null;
    }
    var m = applyScalarTtkMods(w, mod, weaponStat);
    var wScaled = Object.assign({}, w, m);
    if (w.areaDenial) { return simAreaDenial(wScaled, mod, hp); }
    var hasCtx = !!(mod && ((mod.shotEffects && mod.shotEffects.length) || (mod.shotContext && mod.shotContext.magazineCapacity > 0)));
    if (w.isFusion && w.boltsPerBurst && (w.fusionTiming || hasCtx)) { return simFusionBolts(wScaled, mod, hp, null); }
    if (w.isFusion && w.boltsPerBurst) {
      for (var bu = 1; bu <= 20; bu++) {
        for (var bo = 1; bo <= w.boltsPerBurst; bo++) {
          if (bu * bo * m.bodyDmg + PVP_EPS >= hp) {
            var ttk = m.rpm ? m.rpm / 1000 * bu : null, sh = bu * bo;
            var cp = bo >= w.boltsPerBurst ? 100 : Math.ceil((bo - 0.5) * 100 / w.boltsPerBurst);
            return { shots: sh, crits: 0, bodies: sh, ttk: ttk != null ? Math.round(1000 * ttk) / 1000 : null, optimal: bo + 'b', bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, critPercent: cp, bursts: bu };
          }
        }
      }
      return null;
    }
    if (w.pelletsPerShot && (!w.isShotgun || hasCtx)) { return simShotSeq(wScaled, mod || {}, hp, null); }
    if (w.pelletsPerShot) {
      for (var ps = 1; ps <= 3 * w.pelletsPerShot; ps++) {
        for (var pc = 0; pc <= ps; pc++) {
          var pb = ps - pc;
          if (pc * m.headDmg + pb * m.bodyDmg + PVP_EPS >= hp) {
            var pBursts = Math.ceil(ps / w.pelletsPerShot);
            return {
              shots: ps, crits: pc, bodies: pb, ttk: Math.round(1000 * (pBursts <= 1 ? 0 : 60 / m.rpm * (pBursts - 1))) / 1000,
              optimal: pb === 0 ? pc + 'h0b' : pc === 0 ? pb + 'b' : pc + 'h' + pb + 'b',
              bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, critPercent: ps > 0 ? Math.round(100 * pc / ps) : 0,
              isShotgun: !!w.isShotgun, pelletsToKill: ps, pelletsPerShot: w.pelletsPerShot
            };
          }
        }
      }
      return null;
    }
    if (w.chargeBurstSize || w.ammoPerBurst || hasCtx) { return simShotSeq(wScaled, mod || {}, hp, null); }
    for (var s = 1; s <= 100; s++) {
      for (var c = 0; c <= s; c++) {
        var b = s - c;
        if (c * m.headDmg + b * m.bodyDmg + PVP_EPS >= hp) {
          var t = shotTimeAt(s, m.rpm, w);
          var out = {
            shots: s, crits: c, bodies: b, ttk: t != null ? Math.round(1000 * t) / 1000 : null,
            optimal: b === 0 ? c + 'h0b' : c === 0 ? b + 'b' : c + 'h' + b + 'b',
            bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, critPercent: s > 0 ? Math.round(100 * c / s) : 0
          };
          if (w.isBow) { out.hits = s; }
          return out;
        }
      }
    }
    return null;
  }
  function calculateModifiedTTK(w, critAcc, mod, hp, weaponStat) {
    hp = hp == null ? PVP_HP : hp;
    weaponStat = weaponStat == null ? 0 : weaponStat;
    if (!w || !w.bodyDmg) { return null; }
    if (w.assumedOneHit) { return calculateOptimalKill(w, mod, hp, weaponStat); }
    if (w.hitCountOnly) {
      var hcMod = mod ? { dmg: mod.dmg, precDmg: mod.precDmg, blastDmg: mod.blastDmg } : null;
      var hcW = Object.assign({}, w, { hitCountOnly: false, rpm: undefined });
      var hcRes = critAcc == null ? calculateOptimalKill(hcW, hcMod, hp, weaponStat) : calculateModifiedTTK(hcW, critAcc, hcMod, hp, weaponStat);
      return hcRes ? Object.assign({}, hcRes, { hitCountOnly: true, ttk: hcRes.shots === 1 ? 0 : null, shotSequence: [], reloadCount: null }) : null;
    }
    if (critAcc == null) { return calculateOptimalKill(w, mod, hp, weaponStat); }
    var m = applyScalarTtkMods(w, mod, weaponStat);
    var wScaled = Object.assign({}, w, m);
    if (w.areaDenial) { return simAreaDenial(wScaled, mod, hp); }
    var hasCtx = !!(mod && ((mod.shotEffects && mod.shotEffects.length) || (mod.shotContext && mod.shotContext.magazineCapacity > 0)));
    if (w.isFusion && w.boltsPerBurst && (w.fusionTiming || hasCtx)) { return simFusionBolts(wScaled, mod, hp, critAcc); }
    if (w.isFusion && w.boltsPerBurst) {
      var bolts = Math.round(critAcc / 100 * w.boltsPerBurst);
      if (bolts <= 0) { return null; }
      var burstDmg = bolts * m.bodyDmg;
      for (var bu = 1; bu <= 20; bu++) {
        if (bu * burstDmg + PVP_EPS >= hp) {
          var ttk = m.rpm ? m.rpm / 1000 * bu : null, sh = bu * bolts;
          return { shots: sh, crits: 0, bodies: sh, ttk: ttk != null ? Math.round(1000 * ttk) / 1000 : null, optimal: bolts + 'b', bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, bursts: bu };
        }
      }
      return null;
    }
    if (w.pelletsPerShot && (!w.isShotgun || hasCtx)) { return simShotSeq(wScaled, mod || {}, hp, critAcc); }
    var frac = critAcc / 100;
    if (w.pelletsPerShot) {
      for (var ps = 1; ps <= 3 * w.pelletsPerShot; ps++) {
        var pc = Math.round(ps * frac), pb = ps - pc;
        if (pc * m.headDmg + pb * m.bodyDmg + PVP_EPS >= hp) {
          var pe = pc;
          while (pe < ps && pc * m.headDmg + (pe - pc) * m.bodyDmg + PVP_EPS < hp) { pe++; }
          var pB = pe - pc, pBursts = Math.ceil(pe / w.pelletsPerShot);
          return {
            shots: pe, crits: pc, bodies: pB, ttk: Math.round(1000 * (pBursts <= 1 ? 0 : 60 / m.rpm * (pBursts - 1))) / 1000,
            optimal: pB === 0 ? pc + 'h0b' : pc === 0 ? pB + 'b' : pc + 'h' + pB + 'b',
            bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, isShotgun: !!w.isShotgun, pelletsToKill: pe, pelletsPerShot: w.pelletsPerShot
          };
        }
      }
      return null;
    }
    if (w.chargeBurstSize || w.ammoPerBurst || hasCtx) { return simShotSeq(wScaled, mod || {}, hp, critAcc); }
    for (var s = 1; s <= 100; s++) {
      var c = Math.round(s * frac), b = s - c;
      if (c * m.headDmg + b * m.bodyDmg + PVP_EPS >= hp) {
        var n = c;
        while (n < s && c * m.headDmg + (n - c) * m.bodyDmg + PVP_EPS < hp) { n++; }
        var nb = n - c, t = shotTimeAt(n, m.rpm, w);
        var out = {
          shots: n, crits: c, bodies: nb, ttk: t != null ? Math.round(1000 * t) / 1000 : null,
          optimal: nb === 0 ? c + 'h0b' : c === 0 ? nb + 'b' : c + 'h' + nb + 'b',
          bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm
        };
        if (w.isBow) { out.hits = n; }
        return out;
      }
    }
    return null;
  }
  function buildHitBreakdown(w, res, hp) {
    hp = hp == null ? PVP_HP : hp;
    if (res && res.hitCountOnly) { return res; }
    if (!res || (res.shotSequence && res.shotSequence.length)) { return withHitAssumption(res, hp); }
    if (!Number.isInteger(res.shots) || res.shots < 1) { return res; }
    var seq = [], boltsPerBurst = w.isFusion && res.bursts ? res.shots / res.bursts : null, sum = 0;
    for (var r = 0; r < res.shots; r++) {
      var crit = r >= res.bodies;
      var shotIdx = boltsPerBurst ? Math.floor(r / boltsPerBurst) + 1 : (w.pelletsPerShot ? Math.floor(r / w.pelletsPerShot) + 1 : r + 1);
      seq.push({ time: shotTimeAt(shotIdx, res.rpm, w), crit: crit, bodyDmg: res.bodyDmg, headDmg: res.headDmg });
      sum += crit ? res.headDmg : res.bodyDmg;
      if (sum + PVP_EPS >= hp) { break; }
    }
    return withHitAssumption(Object.assign({}, res, {
      crits: seq.filter(function (s) { return s.crit; }).length,
      bodies: seq.filter(function (s) { return !s.crit; }).length,
      shotSequence: seq
    }), hp);
  }
  function formatKillZh(opt, isFusion, hitOnly) {
    if (!opt) { return '—'; }
    var m = opt.match(/^(\d+)h(\d+)b$/);
    if (m) {
      var c = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (hitOnly) { return (c + b) + ' 击'; }
      return b === 0 ? c + ' 精准' : c + ' 精准，' + b + ' 直击';
    }
    var m2 = opt.match(/^(\d+)b$/);
    if (m2) {
      return isFusion ? m2[1] + ' 发弹丸' : hitOnly ? m2[1] + ' 击' : m2[1] + ' 直击';
    }
    return opt;
  }
  function perkLifetimeZh(lf, step) {
    if (!lf) { return ''; }
    var sec = lf.secondsByStack && lf.secondsByStack[step + 1] != null ? lf.secondsByStack[step + 1] : lf.seconds;
    if (lf.consumedPerShot) { return '每发消耗 1 层'; }
    if (lf.lingerSeconds) { return '结束后保留 ' + lf.lingerSeconds + 's'; }
    if (sec == null) { return ''; }
    var out = '持续 ' + sec + 's';
    if (lf.shots) { out += ' 或 ' + lf.shots + ' 发'; }
    if (lf.decay === 'one-at-a-time') { out += ' · 逐层衰减'; }
    if (lf.revertsToStack && step + 1 > lf.revertsToStack) { out += ' · 到期回落 x' + lf.revertsToStack; }
    return out;
  }
  function activePerkRows(i, roll, res) {
    var P = H.getP();
    var r = WR[i], ty = typeName(r), fr = frameOf(r)[0];
    var ammo = ammoEn(V.am[r[W_AMMO]][0]), typeEn = TYPE_EN[ty] || ty, frEn = frameKey(fr);
    var pr = poolRow(i), cols = pr[2], out = [];
    if (!res || !res.perks) { return out; }
    var entries = [];
    for (var c = 0; c < cols.length; c++) {
      var pick = roll.sel[c];
      if (pick != null && pick >= 0) {
        entries.push({ p: pick, key: String(P.p[pick][P_HASH]), isCat: false, isFixed: cellsOf(cols[c]).length === 1 });
      }
    }
    if (roll.cat) { pr[8].forEach(function (p) { entries.push({ p: p, key: String(P.p[p][P_HASH]), isCat: true, isFixed: false }); }); }
    if (roll.mod >= 0) { entries.push({ p: roll.mod, key: String(P.p[roll.mod][P_HASH]), isCat: true, isFixed: false }); }
    var magBase = res.magBaseCap;
    entries.forEach(function (ent) {
      var p = ent.p, ph = String(P.p[p][P_HASH]);
      var step = AUTO_PERKS[ph] ? 0 : perkStepOf(p, ammo, ent.isCat, ent.isFixed);
      var checkOnly = Object.prototype.hasOwnProperty.call(CHECK_ONLY_PERKS, ph) && step === CHECK_ONLY_PERKS[ph];
      if (step < 0 && ph !== '555281244' && ph !== '332733060') { return; }
      if (checkOnly && ph === '65604327') { return; }
      var rec = resolvedPerkSpec(p), rawSpec = rec ? rec.s : null;
      var mod = getPerkDamageModifier(rawSpec, step, true, ph, typeEn, ammo);
      if (!mod) { return; }
      var spec = resolveAmmoSpec(rawSpec, ammo) || {};
      var isAvg = false;
      if (spec.framePrecDmg && frEn) {
        var fp = spec.framePrecDmg[frEn] || spec.framePrecDmg[frEn.replace(/ /g, '-')];
        if (fp != null) { mod.precDmg = fp; } else { isAvg = true; }
      } else if (spec.framePrecDmg) { isAvg = true; }
      if (mod.precDmgByType && mod.precDmgByType[typeEn] != null) { mod.precDmg = mod.precDmgByType[typeEn]; }
      if (mod.heavyPrecDmgByType && mod.heavyPrecDmgByType[typeEn] != null && ammo === 'Heavy') {
        mod.precDmg = mod.heavyPrecDmgByType[typeEn];
      } else if (spec.heavyPrecDmg != null && ammo === 'Heavy') {
        mod.precDmg = spec.heavyPrecDmg;
      }
      if (mod.dmgByType && mod.dmgByType[typeEn] != null) { mod.dmg = mod.dmgByType[typeEn]; }
      if (mod.blastDmgByType && mod.blastDmgByType[typeEn] != null) { mod.blastDmg = mod.blastDmgByType[typeEn]; }
      var steps = mod.stepCount || (mod.shotEffects ? 1 : perkSteps(spec, p, ammo, magBase));
      out.push({
        p: p, hash: ph, name: plugName(p), icon: P.p[p][P_ICON],
        isEnhanced: isEnhancedPlug(p, cols),
        step: step, steps: steps, mod: mod, isAverage: isAvg, lifetime: spec.lifetime || null
      });
    });
    return out;
  }
  var PVP_ANIM_MS = 666, pvpTween = null, pvpShown = { body: null, crit: null }, pvpSel = null;
  function easePvp(e) {
    if (e <= 0) { return 0; }
    if (e >= 1) { return 1; }
    function bez(a, b, r) { var n = 1 - r; return 3 * n * n * r * a + 3 * n * r * r * b + r * r * r; }
    var lo = 0, hi = 1, n = e, i, x;
    for (i = 0; i < 14; i++) {
      x = bez(0.4, 0.2, n);
      if (Math.abs(x - e) < 1e-5) { break; }
      if (x < e) { lo = n; } else { hi = n; }
      n = (lo + hi) / 2;
    }
    return bez(0, 1, n);
  }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function pvpView(i, res) {
    var P = H.getP(), HSTAT = H.getHSTAT();
    var r = WR[i], ty = typeName(r), fr = frameOf(r)[0], frEn = frameKey(fr);
    var ammoZh = V.am[r[W_AMMO]][0], ammo = ammoEn(ammoZh), tyEn = TYPE_EN[ty] || ty;
    var roll = rollOf(i);
    var ttkData = getTtkData(i, res.activeHashes);
    var ws = weaponsStatMods(S.pvpStat);
    var rpmKey = ttkData && ttkData.isBow ? STAT_HASH.DRAW_TIME
      : (ttkData && ttkData.isChargeTime ? STAT_HASH.CHARGE_TIME : STAT_HASH.RPM);
    var rpmRow = HSTAT ? res.byStat[HSTAT[rpmKey]] : null;
    var blastRow = ttkData && ttkData.impactDmg != null && HSTAT ? res.byStat[HSTAT[STAT_HASH.BLAST]] : null;
    var rangeRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.RANGE]] : null;
    var reloadRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.RELOAD]] : null;
    var handRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.HANDLING]] : null;
    var zoomRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.ZOOM]] : null;
    var perks = activePerkRows(i, roll, res);
    var dmgScale = 1, precScale = 1, blastScale = 1, rpmMul = 1, ctMod = 1, reloadPerkMul = 1;
    var shotEffects = [];
    perks.forEach(function (row) {
      var m = row.mod;
      if (m.shotEffects) { shotEffects = shotEffects.concat(m.shotEffects); }
      if (m.dmg != null) { dmgScale *= m.dmg; }
      if (m.blastDmg != null) { blastScale *= m.blastDmg; }
      if (m.precDmg != null) { precScale *= m.precDmg; }
      var rm = m.rpmModByType && m.rpmModByType[tyEn] != null ? m.rpmModByType[tyEn] : m.rpmMod;
      if (rm != null) { rpmMul *= rm; }
      if (m.chargeTimeMod != null) { ctMod *= m.chargeTimeMod; }
      if (m.reloadDurationMod != null) { reloadPerkMul *= m.reloadDurationMod; }
    });
    var fxReloadMul = 1, fxHandlingMul = 1;
    fxAll().forEach(function (f) {
      var d = fxDmgOf(f, true);
      if (d !== 1) { dmgScale *= d; }
      fxReloadMul *= fxMulOf(f, 'reloadDurationMod');
      fxHandlingMul *= fxMulOf(f, 'handlingDurationMod');
    });
    var reloadMul = ws.reloadDurationScale * reloadPerkMul * fxReloadMul;
    var handlingMul = ws.handlingDurationScale * fxHandlingMul;
    var blastInfo = null;
    if (blastRow && ttkData && ttkData.impactDmg != null) {
      blastInfo = { blastValue: effStatVal(res, blastRow), baseBlastValue: blastRow.base };
    }
    var baseW = ttkData ? Object.assign({}, ttkData) : null;
    if (baseW && blastInfo) {
      var b0 = baseW.impactDmg + baseW.blastFloor + (baseW.blastCap - baseW.blastFloor) * (blastInfo.baseBlastValue / 100);
      baseW.bodyDmg = b0; baseW.headDmg = b0;
    }
    if (baseW && rpmRow) { baseW.rpm = ttkData.rpm != null ? ttkData.rpm : rpmRow.base; }
    var effW = baseW ? Object.assign({}, baseW) : null;
    var q = res.flatChargeDraw || 0;
    if (effW) {
      if (blastInfo && blastInfo.blastValue !== blastInfo.baseBlastValue) {
        var b1 = ttkData.impactDmg + ttkData.blastFloor + (ttkData.blastCap - ttkData.blastFloor) * (blastInfo.blastValue / 100);
        effW.bodyDmg = b1; effW.headDmg = b1;
      }
      if (rpmRow && rpmRow.value !== rpmRow.base) {
        effW.rpm = ttkData.rpm != null ? ttkData.rpm * rpmRow.value / rpmRow.base : rpmRow.value;
      }
      if (q !== 0 && baseW.isChargeTime && !baseW.isBow) {
        effW.rpm = Math.max(1, effW.rpm + q);
        effW.bodyDmg *= 1 + 5e-4 * q;
        effW.headDmg *= 1 + 5e-4 * q;
      }
    }
    var flatBadges = [], flatBadgeHashes = {};
    if (q !== 0 && baseW && baseW.isChargeTime && !baseW.isBow) {
      var ctKeyStr = String(STAT_HASH.CHARGE_TIME);
      (res.allPlugs || res.perks).forEach(function (p) {
        var rec = resolvedPerkSpec(p), spec = rec ? resolveAmmoSpec(rec.s, ammo) : null;
        if (!spec || spec[ctKeyStr] == null || spec[ctKeyStr] === 0) { return; }
        var raw = spec[ctKeyStr], v = raw && typeof raw === 'object' && raw.f ? raw.v : raw;
        if (typeof v !== 'number' || !v) { return; }
        var ph = String(P.p[p][P_HASH]);
        flatBadgeHashes[ph] = 1;
        flatBadges.push({ p: p, ph: ph, name: plugName(p), icon: P.p[p][P_ICON], flatMs: v, dmgPct: Math.abs(0.05 * v), dmgIncrease: v > 0 });
      });
    }
    var showPerks = perks.filter(function (row) {
      var m = row.mod;
      var active = !!(m.shotEffects || m.dmg || m.blastDmg || m.precDmg || m.rpmMod || m.rpmModByType || m.chargeTimeMod);
      return active && !flatBadgeHashes[row.hash];
    });
    var reloadStat = reloadRow ? effStatVal(res, reloadRow) : null;
    var baseReloadTime = reloadRow ? reloadSeconds(ty, ammoZh, reloadRow.base, 1, frEn) : null;
    var curReloadRaw = reloadStat != null ? reloadSeconds(ty, ammoZh, reloadStat, 1, frEn) : null;
    var reloadTime = curReloadRaw != null ? curReloadRaw * reloadMul : null;
    var expiredOnslaughtRel = null, afterHitRel = null;
    if (curReloadRaw != null && HSTAT) {
      var onsRelRemove = 0, lionRelRemove = 0;
      perks.forEach(function (row) {
        if (row.step < 0) { return; }
        var phNum = +row.hash;
        if (phNum !== 95528736 && phNum !== 956288240 && phNum !== 2003108620) { return; }
        var sp = resolvedPerkSpec(row.p);
        var relVal = sp && sp.s && sp.s[String(STAT_HASH.RELOAD)];
        var nVal = relVal != null ? Number(pickStep(relVal, row.step, ammo)) || 0 : 0;
        if (phNum === 2003108620) { lionRelRemove += nVal; } else { onsRelRemove += nVal; }
      });
      if (onsRelRemove) {
        var rNoOns = reloadSeconds(ty, ammoZh, Math.max(0, Math.min(100, reloadStat - onsRelRemove)), 1, frEn);
        if (rNoOns != null) { expiredOnslaughtRel = rNoOns * reloadMul; }
      }
      if ((P && P.en && P.en[i] === 'Fighting Lion') && lionRelRemove >= 0) {
        var rHit = reloadSeconds(ty, ammoZh, Math.max(0, Math.min(100, reloadStat - lionRelRemove + 70)), 1, frEn);
        if (rHit != null) { afterHitRel = rHit * reloadMul; }
      }
    }
    var magBase = res.magBaseCap, magOv = null, ovStep = 0;
    if (magBase != null && res.overflowPerks.length) {
      var ovFirst = res.overflowPerks[0];
      ovStep = perkStepOf(ovFirst.p, ammo);
      magOv = calculateOverflowSteps(ovFirst.overflowDef, magBase, ammo);
    }
    var e4Mag = magOv && magOv.steps && ovStep >= 0 ? magOv.steps[Math.max(0, Math.min(ovStep, magOv.steps.length - 1))] : magBase;
    var magMax = Number.isFinite(e4Mag) && e4Mag >= 1 ? Math.floor(e4Mag) : null;
    var magStart = magMax == null ? null : (S.pvpMag == null ? magMax : Math.max(1, Math.min(magMax, Math.round(S.pvpMag))));
    var hasModCtx = shotEffects.length > 0 || reloadMul !== 1 || dmgScale !== 1 || blastScale !== 1 || precScale !== 1 || rpmMul !== 1 || ctMod !== 1 || (magStart != null && magStart > 0);
    var aa = hasModCtx ? {
      shotEffects: shotEffects,
      shotContext: {
        magazineCapacity: magBase, loadedMagazine: magStart,
        afterHitReloadSeconds: afterHitRel, reloadSeconds: reloadTime,
        expiredOnslaughtReloadSeconds: expiredOnslaughtRel, heavyBurst: frEn === 'Heavy Burst'
      },
      dmg: dmgScale !== 1 ? dmgScale : undefined,
      blastDmg: blastScale !== 1 ? blastScale : undefined,
      precDmg: precScale !== 1 ? precScale : undefined,
      rpmMod: rpmMul !== 1 ? rpmMul : undefined,
      chargeTimeMod: ctMod !== 1 ? ctMod : undefined,
      reloadDurationMod: reloadMul !== 1 ? reloadMul : undefined
    } : null;
    var baseOpt = baseW ? calculateOptimalKill(baseW, null, PVP_HP, 0) : null;
    var optKill = effW ? calculateOptimalKill(effW, aa, PVP_HP, S.pvpStat) : null;
    var optAcc = optKill && optKill.critPercent != null ? optKill.critPercent : (baseOpt ? baseOpt.critPercent : 100);
    var isFusion = !!(effW && effW.isFusion);
    var accDirty = S.pvpAcc != null;
    var acc = accDirty ? S.pvpAcc : optAcc;
    var activeKill = effW ? (accDirty ? calculateModifiedTTK(effW, acc, aa, PVP_HP, S.pvpStat) : optKill) : null;
    var bodySim = effW ? (isFusion ? activeKill : calculateModifiedTTK(effW, 0, aa, PVP_HP, S.pvpStat)) : null;
    var headSim = effW ? (isFusion ? activeKill : calculateModifiedTTK(effW, 100, aa, PVP_HP, S.pvpStat)) : null;
    var bodyDmg = (bodySim && bodySim.bodyDmg != null) ? bodySim.bodyDmg : (activeKill && activeKill.bodyDmg != null ? activeKill.bodyDmg : (effW ? effW.bodyDmg : null));
    var headDmg = (headSim && headSim.headDmg != null) ? headSim.headDmg : (activeKill && activeKill.headDmg != null ? activeKill.headDmg : (effW ? effW.headDmg : null));
    var baseBodyDmg = baseW ? (baseOpt && baseW.areaDenial ? baseOpt.bodyDmg : baseW.bodyDmg) : null;
    var baseHeadDmg = baseW ? baseW.headDmg : null;
    var dispRpm = effW ? (rpmRow ? rpmRow.value : effW.rpm) : null;
    if (dispRpm != null && effW) {
      if (!effW.isChargeTime && rpmMul !== 1) { dispRpm /= rpmMul; }
      if (effW.isChargeTime && ctMod !== 1) { dispRpm *= ctMod; }
      if (effW.isBow && res.overflowPerks.length && res.overflowPerks[0].overflowDef.drawTimePcts) {
        var dtPcts = res.overflowPerks[0].overflowDef.drawTimePcts;
        var dtIdx = Math.max(0, Math.min(ovStep, dtPcts.length - 1));
        dispRpm = Math.round(dispRpm * (1 - dtPcts[dtIdx]));
      }
    }
    var baseRpm = baseW ? (rpmRow ? rpmRow.base : baseW.rpm) : null;
    var rangeStat = rangeRow ? effStatVal(res, rangeRow) : null;
    var rm = rangeStat != null ? rangeMeters(ty, fr, rangeStat, {
      zoomStat: zoomRow ? zoomRow.value : null, intrinsicHash: res.intrinsicHash,
      bodyDmg: ttkData ? ttkData.bodyDmg : null,
      modifiers: { rangeAllScale: res.rangeAllScale, rangeHipScale: res.rangeHipScale, rangeAdsStatAdd: res.rangeAdsStatAdd }
    }) : null;
    var baseRm = rangeRow ? rangeMeters(ty, fr, rangeRow.base, {
      zoomStat: zoomRow ? zoomRow.base : null, intrinsicHash: res.intrinsicHash,
      bodyDmg: ttkData ? ttkData.bodyDmg : null
    }) : null;
    var handStat = handRow ? effStatVal(res, handRow) : null;
    var handCur = handStat != null ? handlingTimes(ty, res.intrinsicHash, handStat, handlingMul, res.activeHashes) : null;
    var handBase = handRow ? handlingTimes(ty, res.intrinsicHash, handRow.base, 1, res.activeHashes) : null;
    var ttkVal = activeKill ? activeKill.ttk : null;
    var optStr = (isFusion ? (optKill && optKill.optimal) : (activeKill && activeKill.optimal)) || (baseOpt && baseOpt.optimal);
    var killStr = activeKill && activeKill.areaDenial
      ? activeKill.triggerPulls + ' 次发射 + 领域'
      : formatKillZh(optStr, isFusion, !!(effW && effW.bodyDmg === effW.headDmg));
    return {
      ty: ty, tyEn: tyEn, ttkData: ttkData, baseW: baseW, effW: effW, ws: ws,
      baseOpt: baseOpt, optKill: optKill, activeKill: activeKill,
      optAcc: optAcc, acc: acc, accDirty: accDirty, isFusion: isFusion,
      ttk: ttkVal, kill: killStr, bodyDmg: bodyDmg, headDmg: headDmg,
      baseBodyDmg: baseBodyDmg, baseHeadDmg: baseHeadDmg,
      dispRpm: dispRpm, baseRpm: baseRpm, rpmRow: rpmRow,
      blastInfo: blastInfo, aa: aa,
      rm: rm, baseRm: baseRm, rangeStat: rangeStat, rangeRow: rangeRow,
      rs: reloadTime, baseRs: baseReloadTime, reloadStat: reloadStat, reloadRow: reloadRow,
      handCur: handCur, handBase: handBase, handStat: handStat, handRow: handRow,
      magMax: magMax, magStart: magStart,
      perks: perks, showPerks: showPerks, flatBadges: flatBadges,
      bursts: activeKill ? activeKill.bursts : null,
      hits: activeKill ? activeKill.hits : null,
      pelletsToKill: activeKill ? activeKill.pelletsToKill : null,
      pelletsPerShot: (activeKill && activeKill.pelletsPerShot) || (effW && effW.pelletsPerShot) || null,
      bodyVaries: !!(bodySim && bodySim.shotSequence && bodySim.shotSequence.some(function (s) { return Math.abs(s.bodyDmg - bodySim.shotSequence[0].bodyDmg) > 1e-9; })),
      headVaries: !!(headSim && headSim.shotSequence && headSim.shotSequence.some(function (s) { return Math.abs(s.headDmg - headSim.shotSequence[0].headDmg) > 1e-9; }))
    };
  }
  function pvpSet(pane, key, text) {
    var n = pane.querySelector('[data-pvp="' + key + '"]');
    if (n) { n.textContent = text; }
  }
  function pvpNumSet(pane, key, val) {
    var n = pane.querySelector('[data-pvp="' + key + '"]');
    if (n) { n.innerHTML = val; }
  }
  function pvpCls(pane, key, cls) {
    var n = pane.querySelector('[data-pvp="' + key + '"]');
    if (!n) { return; }
    n.classList.remove('up', 'down', 'better', 'worse');
    if (cls) { n.classList.add(cls); }
  }
  function pvpHeroHtml(v, shownTtk, shownBursts, shownHits, shownPelKill, shownPelShot) {
    var effW = v.effW, ttkVal = shownTtk != null ? shownTtk : v.ttk;
    if (ttkVal == null) { return esc(v.kill || '—'); }
    if (v.tyEn === 'Sword' || (effW && effW.assumedOneHit)) { return '一击击杀'; }
    if (v.isFusion) {
      var b = shownBursts != null ? Math.round(shownBursts) : v.bursts;
      return fmtS(ttkVal) + ' <span class="pvp-stat-hero-sub">(' + (b === 1 ? '单发蓄力' : b + ' 次蓄力') + ')</span>';
    }
    if (effW && effW.isBow) {
      var h = shownHits != null ? Math.round(shownHits) : v.hits;
      return fmtS(ttkVal) + ' <span class="pvp-stat-hero-sub">(' + (h === 1 ? '一击击杀' : h + ' 箭') + ')</span>';
    }
    if (effW && effW.isShotgun) {
      var pk = shownPelKill != null ? Math.round(shownPelKill) : v.pelletsToKill;
      var ps = shownPelShot != null ? Math.round(shownPelShot) : v.pelletsPerShot;
      var shots = ps ? Math.ceil(pk / ps) : 1;
      return pk + ' / ' + ps + ' <span class="pvp-stat-hero-sub">(' + (shots <= 1 ? '一枪击杀' : shots + ' 枪') + ')</span>';
    }
    if (ttkVal === 0) { return esc(v.kill || '一击击杀'); }
    return fmtS(ttkVal);
  }
  function pvpAnimSnapshot(v) {
    return {
      ttk: v.ttk, body: v.bodyDmg, head: v.headDmg, rpm: v.dispRpm,
      hip: v.rm ? v.rm.hip : null, ads: v.rm ? v.rm.ads : null, reload: v.rs,
      ready: v.handCur ? v.handCur.ready : null, stow: v.handCur ? v.handCur.stow : null,
      hAds: v.handCur ? v.handCur.ads : null, bursts: v.bursts, hits: v.hits,
      pelKill: v.pelletsToKill, pelShot: v.pelletsPerShot
    };
  }
  function paintPvpNumbers(pane, v, snap, cls) {
    pvpNumSet(pane, 'ttk', pvpHeroHtml(v, snap.ttk, snap.bursts, snap.hits, snap.pelKill, snap.pelShot));
    pvpSet(pane, 'kill', v.kill);
    if (v.blastInfo && v.ttkData) {
      var imp = v.ttkData.impactDmg * (v.ws.percent > 0 && S.pvpStat > 100 ? 1 + 5e-4 * (S.pvpStat - 100) : 1) * ((v.aa && v.aa.dmg) || 1);
      var blast = (snap.body != null ? snap.body : v.bodyDmg || 0) - imp;
      pvpSet(pane, 'impact', roundPvpDamage(imp));
      pvpSet(pane, 'blast', roundPvpDamage(blast));
    } else {
      if (snap.body != null) { pvpSet(pane, 'body', roundPvpDamage(snap.body)); }
      if (snap.head != null) { pvpSet(pane, 'crit', roundPvpDamage(snap.head)); }
    }
    if (snap.rpm != null) {
      pvpSet(pane, 'rpm', v.effW && v.effW.isChargeTime ? Math.round(snap.rpm) + 'ms' : String(Math.round(snap.rpm)));
    }
    if (snap.hip != null) { pvpSet(pane, 'hip', fmtM(snap.hip)); }
    if (snap.ads != null) { pvpSet(pane, 'ads', fmtM(snap.ads)); }
    if (snap.reload != null) { pvpSet(pane, 'reload', fmtS(snap.reload)); }
    if (snap.ready != null) { pvpSet(pane, 'ready', fmtS(snap.ready)); }
    if (snap.stow != null) { pvpSet(pane, 'stow', fmtS(snap.stow)); }
    if (snap.hAds != null) { pvpSet(pane, 'hads', fmtS(snap.hAds)); }
    pvpCls(pane, 'body', cls);
    pvpCls(pane, 'crit', cls);
    pvpCls(pane, 'ttk', cls);
  }
  function pvpWeaponStatNoteHtml(v) {
    if (S.pvpStat === 0) { return '<span class="pvp-weapon-stat-note">超过 100 提升伤害 · 无加成</span>'; }
    var parts = [];
    if (S.pvpStat > 100) {
      parts.push('<span class="pvp-ws-item"><b class="pvp-ws-val">+' + ((S.pvpStat - 100) * 0.05).toFixed(1) + '%</b> 伤害</span>');
    }
    if (v.ws.percent > 0) {
      parts.push('<span class="pvp-ws-item"><b class="pvp-ws-val">−' + v.ws.percent.toFixed(1) + '%</b> 填装与操控</span>');
    }
    return parts.join('<span class="pvp-ws-sep" aria-hidden="true">/</span>');
  }
  function updatePvpControls(pane, v) {
    if (v.isFusion && v.effW) {
      pvpSet(pane, 'acc', Math.round(v.effW.boltsPerBurst * v.acc / 100) + '/' + v.effW.boltsPerBurst);
    } else {
      pvpSet(pane, 'acc', v.acc + '%');
    }
    var rst = pane.querySelector('[data-act="pvpreset"]');
    if (rst) { rst.hidden = !v.accDirty; }
    var accSl = pane.querySelector('[data-act="pvpacc"]');
    if (accSl && document.activeElement !== accSl) { accSl.value = v.acc; }
    var wsNum = pane.querySelector('[data-act="pvpstatnum"]');
    if (wsNum && document.activeElement !== wsNum) { wsNum.value = String(S.pvpStat); }
    var wsSl = pane.querySelector('[data-act="pvpstat"]');
    if (wsSl && document.activeElement !== wsSl) { wsSl.value = S.pvpStat; }
    var wsRst = pane.querySelector('[data-act="pvpstatreset"]');
    if (wsRst) { wsRst.hidden = S.pvpStat === 0; }
    var wsDesc = pane.querySelector('[data-pvp="wnote"]');
    if (wsDesc) { wsDesc.innerHTML = pvpWeaponStatNoteHtml(v); }
    if (v.magMax != null && v.magStart != null) {
      var magNum = pane.querySelector('[data-act="pvpmagnum"]');
      if (magNum && document.activeElement !== magNum && !S.pvpMagBlank) {
        magNum.value = String(v.magStart);
        magNum.style.width = String(v.magStart).length + 'ch';
      }
      var magSl = pane.querySelector('[data-act="pvpmag"]');
      if (magSl && document.activeElement !== magSl) { magSl.value = v.magStart; }
      var magRst = pane.querySelector('[data-act="pvpmagreset"]');
      if (magRst) { magRst.hidden = v.magStart === v.magMax; }
    }
  }
  function refreshPvpNumbers() {
    var P = H.getP(), SIDX = H.getSIDX();
    var pane = body.querySelector('.pvp-stats');
    if (!pane || S.sel == null || !P || !SIDX) { return; }
    if (pvpTween) { cancelAnimationFrame(pvpTween); pvpTween = null; }
    var v = pvpView(S.sel, compute(S.sel, rollOf(S.sel)));
    updatePvpControls(pane, v);
    var snap = pvpAnimSnapshot(v);
    pvpShown = snap;
    paintPvpNumbers(pane, v, snap, '');
    var perksHtml = pvpPerkBadges(v.showPerks, v.flatBadges, v.tyEn, v.effW);
    var perksEl = pane.querySelector('[data-pvp="perks"]');
    if (perksEl) { perksEl.innerHTML = perksHtml; perksEl.hidden = !perksHtml; }
  }
  function kickPvpAnim() {
    var P = H.getP(), SIDX = H.getSIDX();
    var pane = body.querySelector('.pvp-stats');
    if (!pane || S.sel == null || !P || !SIDX) { return; }
    if (pvpSel !== S.sel) { pvpShown = {}; pvpSel = S.sel; }
    var v = pvpView(S.sel, compute(S.sel, rollOf(S.sel)));
    updatePvpControls(pane, v);
    var to = pvpAnimSnapshot(v), from = pvpShown;
    if (pvpTween) { cancelAnimationFrame(pvpTween); pvpTween = null; }
    var changed = from.body == null || from.body !== to.body || from.crit !== to.head || from.ttk !== to.ttk;
    if (reduceMotion() || from.body == null || !changed) {
      pvpShown = to;
      paintPvpNumbers(pane, v, to, '');
      return;
    }
    var cls = ((to.body || 0) > (from.body || 0) || (to.head || 0) > (from.head || 0)) ? 'up'
      : ((to.body || 0) < (from.body || 0) || (to.head || 0) < (from.head || 0)) ? 'down' : '';
    var t0 = null;
    function lerp(a, b, e) { return a == null || b == null ? b : a + (b - a) * e; }
    function frame(now) {
      if (t0 == null) { t0 = now; }
      var u = Math.min((now - t0) / PVP_ANIM_MS, 1), e = easePvp(u);
      var mid = {
        ttk: lerp(from.ttk, to.ttk, e), body: lerp(from.body, to.body, e), head: lerp(from.head, to.head, e),
        rpm: lerp(from.rpm, to.rpm, e), hip: lerp(from.hip, to.hip, e), ads: lerp(from.ads, to.ads, e),
        reload: lerp(from.reload, to.reload, e), ready: lerp(from.ready, to.ready, e),
        stow: lerp(from.stow, to.stow, e), hAds: lerp(from.hAds, to.hAds, e),
        bursts: lerp(from.bursts, to.bursts, e), hits: lerp(from.hits, to.hits, e),
        pelKill: lerp(from.pelKill, to.pelKill, e), pelShot: to.pelShot
      };
      paintPvpNumbers(pane, v, mid, u < 1 ? cls : '');
      if (u < 1) { pvpTween = requestAnimationFrame(frame); }
      else { pvpShown = to; pvpTween = null; }
    }
    paintPvpNumbers(pane, v, from, cls);
    pvpTween = requestAnimationFrame(frame);
  }
  function perkBadgeLines(row, tyEn, w) {
    var m = row.mod, out = [], lt = m.shotEffects ? '' : perkLifetimeZh(row.lifetime, row.step);
    var suffix = lt ? ' · ' + lt : '';
    function pctText(mult, label) {
      var d = Number(((mult - 1) * 100).toFixed(2));
      return { text: (d < 0 ? '−' : '+') + Math.abs(d) + '% ' + label + suffix, neg: d < 0 };
    }
    if (m.dmg != null && m.dmg !== 1) { out.push(pctText(m.dmg, '伤害')); }
    if (m.blastDmg != null && m.blastDmg !== 1) { out.push(pctText(m.blastDmg, '爆炸伤害')); }
    if (m.precDmg != null && m.precDmg !== 1) { out.push(pctText(m.precDmg, (row.isAverage ? '平均' : '') + '精准伤害')); }
    var rpmM = m.rpmModByType && m.rpmModByType[tyEn] != null ? m.rpmModByType[tyEn] : m.rpmMod;
    if (w && (w.isChargeTime || w.isBow)) {
      var lbl = w.isBow ? '蓄力时间' : '充能时间';
      if (m.chargeTimeMod && m.chargeTimeMod < 1) { out.push({ text: lbl + '减少 ' + parseFloat(((1 - m.chargeTimeMod) * 100).toFixed(2)) + '%', neg: false }); }
      if (m.chargeTimeMod && m.chargeTimeMod > 1) { out.push({ text: lbl + '增加 ' + parseFloat(((m.chargeTimeMod - 1) * 100).toFixed(2)) + '%', neg: true }); }
    } else if (rpmM != null && rpmM !== 1) {
      if (rpmM < 1) { out.push({ text: '射速提升 ' + parseFloat(((1 - rpmM) * 100).toFixed(2)) + '%', neg: false }); }
      else { out.push({ text: '射速降低 ' + parseFloat(((rpmM - 1) * 100).toFixed(2)) + '%', neg: true }); }
    }
    if (m.shotEffects) {
      m.shotEffects.forEach(function (ef) {
        var k = ef.kind, t = '';
        if (k === 'focusedFury') { t = '+25% 伤害（命中弹匣 35% 精准后）· 持续 ' + (ef.enhanced ? 12 : 11) + 's'; }
        else if (k === 'controlledBurst') { t = '+20% 伤害 · −10% 充能（全中一轮后）· 持续 ' + (ef.enhanced ? 2.5 : 2) + 's'; }
        else if (k === 'backupPlan') { t = '−20% 伤害 · −30% 充能 · 持续 ' + (ef.enhanced ? 2.5 : 2) + 's'; }
        else if (k === 'kickstart') { t = '+15% 伤害 · −20% 充能时间'; }
        else if (k === 'bluntExecution') { t = '+100% 伤害 · 仅限首轮点射'; }
        else if (k === 'archersTempo') { t = '精准命中后 −25% 蓄力时间 · 持续 ' + (ef.enhanced ? 4 : 3) + 's'; }
        else if (k === 'archersGambit') { t = '腰射精准后 −60% 蓄力时间'; }
        else if (k === 'successfulWarmup') { t = '−37.5% 充能/蓄力时间 · 持续 6s'; }
        else if (k === 'adagio') { t = '+' + (ef.weaponType === 'Hand Cannon' ? 27 : 30) + '% 伤害 · +20% 射击间隔 · 持续 ' + (ef.enhanced ? 8 : 7) + 's'; }
        else if (k === 'explosiveLight') { t = '初始 ' + (ef.enhanced ? 7 : 6) + ' 层 · 每发消耗 1 层'; }
        else if (k === 'boxBreathing') { t = '首枪精准加成 +' + Math.round((ef.precisionMultiplier - 1) * 100) + '% · 预先瞄准 ' + (ef.enhanced ? '1.4' : '1.5') + 's'; }
        else if (k === 'oneForAll') { t = '+35% 伤害 · 持续 ' + (ef.enhanced ? '11' : '10') + 's'; }
        else if (k === 'harmony') { t = '+20% 伤害 · 持续 ' + (ef.enhanced ? '8' : '7') + 's'; }
        else if (k === 'killClip') { t = '+25% 伤害 · 持续 ' + (ef.enhanced ? '5.5' : '5') + 's'; }
        else if (k === 'magnificentHowl') { t = '+' + (ef.enhanced ? 55 : 50) + '% 伤害 · 每发消耗 1 层'; }
        else if (k === 'recombination') { t = '+' + parseFloat((ef.stacks * (ef.enhanced ? 6.25 : 5)).toFixed(2)) + '% 伤害 · 仅限首枪'; }
        else if (k === 'onslaught') { t = '射击延迟 −' + parseFloat(((1 - ef.delayScale) * 100).toFixed(1)) + '% · 持续 ' + (ef.enhanced ? 5 : 4.5) + 's'; }
        else if (k === 'desperado') { t = '射击延迟 −30% · 持续 ' + (ef.enhanced ? '7' : '6') + 's'; }
        else if (k === 'cascadePoint') { t = '射击延迟 −' + Math.round((1 - ef.delayScale) * 100) + '% · 持续 ' + (ef.enhanced ? '2.75' : '2.5') + 's'; }
        else if (k === 'reservoirBurst') { t = '满弹及以上时 +' + (ef.enhanced ? '33' : '30') + '% 伤害'; }
        else if (k === 'highImpactReserves') { t = '剩余 ≤' + (ef.enhanced ? '55' : '50') + '% 弹匣起最高 +6% 伤害'; }
        else if (k === 'precisionInstrument') {
          var maxP = ef.enhanced ? 30 : 25;
          t = ef.initialStacks > 0
            ? '+' + parseFloat((ef.initialStacks / 6 * maxP).toFixed(2)) + '% 精准伤害起步 · 递增至 +' + maxP + '%'
            : '随连续命中递增至 +' + maxP + '% 精准伤害';
        } else if (k === 'targetLock') { t = '随连续命中递增至 +' + (ef.enhanced ? 30 : 25) + '% 伤害'; }
        if (t) { out.push({ text: t, neg: false }); }
      });
    }
    return out;
  }
  function pvpPerkBadges(showPerks, flatBadges, tyEn, w) {
    if ((!showPerks || !showPerks.length) && (!flatBadges || !flatBadges.length)) { return ''; }
    var html = '<span class="pvp-damage-perks-title">生效词条</span>';
    (flatBadges || []).forEach(function (fb) {
      html += '<div class="pvp-perk-badge">' + imgTag(fb.icon, 'pvp-perk-icon', '', true) +
        '<span class="pvp-perk-info"><span class="pvp-perk-name">' + esc(fb.name) + '</span>' +
        '<span class="pvp-perk-effect' + (fb.dmgIncrease ? '' : ' negative') + '">' +
        (fb.dmgIncrease ? '+' : '−') + parseFloat(fb.dmgPct.toFixed(2)) + '% 伤害</span></span></div>';
    });
    (showPerks || []).forEach(function (row) {
      var lines = perkBadgeLines(row, tyEn, w);
      var isPI = !!(row.mod.shotEffects && row.mod.shotEffects.some(function (e) { return e.kind === 'precisionInstrument'; }));
      html += '<button type="button" class="pvp-perk-badge"' +
        (row.steps > 1 ? ' data-act="perkstep" data-v="' + row.hash + '" data-n="' + row.steps + '"' +
          (isPI ? ' data-pi="1"' : '') : '') + '>' +
        imgTag(row.icon, 'pvp-perk-icon', '', true) +
        '<span class="pvp-perk-info"><span class="pvp-perk-name">' + esc(row.name) +
        (row.steps > 1 ? '<span class="pvp-perk-step"> ×' + (row.step + 1) + '</span>' : '') +
        '</span>' + lines.map(function (ln) {
          return '<span class="pvp-perk-effect' + (ln.neg ? ' negative' : '') + '">' + esc(ln.text) + '</span>';
        }).join('') + '</span></button>';
    });
    return html;
  }
  function pvpPanel(i, res) {
    var SIDX = H.getSIDX(), PERK_FX = H.getPERK_FX();
    if (!SIDX) { return '<p class="src">词条池载入中，暂无法计算 PvP 数值。</p>'; }
    if (!PERK_FX) {
      ensurePerkFx(function () { if (S.statsMode === 'pvp' && S.sel === i) { renderDetail(); } });
    }
    var v = pvpView(i, res), ttk = v.activeKill, rm = v.rm, rs = v.rs, effW = v.effW;
    if (!v.ttkData || !effW) { return '<div class="pvp-stats"><p class="src">该武器类型暂无 PvP 伤害数据。</p></div>'; }
    var useLive = pvpSel === i && pvpShown.body != null;
    var bodyN = useLive ? pvpShown.body : v.bodyDmg;
    var critN = useLive ? pvpShown.crit : v.headDmg;
    var ttkShow = useLive && pvpShown.ttk != null ? pvpShown.ttk : v.ttk;
    function pvpItem(k, val, extra, key) {
      return '<div class="pvp-stat-item"><span class="pvp-stat-label">' + k + '</span><span class="pvp-stat-value"' +
        (key ? ' data-pvp="' + key + '"' : '') + '>' + val + '</span></div>' + (extra || '');
    }
    var heroLabel = effW.hitCountOnly ? '击杀所需命中' : effW.isShotgun ? '击杀所需弹丸' : '击杀时间';
    var sameDmg = effW.bodyDmg === effW.headDmg;
    var hitOrAccHtml = '';
    if (v.tyEn !== 'Sword') {
      if (sameDmg && !v.isFusion) {
        hitOrAccHtml = pvpItem(effW.areaDenial ? '伤害事件次数' : '命中次数', ttk ? String(ttk.shots) : '—');
      } else {
        var accDisp = v.isFusion ? Math.round(effW.boltsPerBurst * v.acc / 100) + '/' + effW.boltsPerBurst : v.acc + '%';
        var accMin = v.isFusion ? Math.ceil(50 / effW.boltsPerBurst) : 0;
        var optDisp = v.isFusion ? Math.round(effW.boltsPerBurst * v.optAcc / 100) + '/' + effW.boltsPerBurst + ' 发弹丸' : v.optAcc + '%';
        hitOrAccHtml = pvpItem(
          (v.isFusion ? '命中弹丸数' : '精准率') +
          '<button type="button" class="pvp-crit-reset" data-act="pvpreset" title="重置为最优 (' + esc(optDisp) + ')"' +
          (v.accDirty ? '' : ' hidden') + '>↺</button>',
          accDisp,
          '<div class="pvp-slat"><input class="pvp-crit-range" type="range" min="' + accMin + '" max="100" step="1" value="' +
          v.acc + '" data-act="pvpacc"></div>',
          'acc'
        );
      }
    }
    var dmgHtml = '';
    if (v.tyEn !== 'Sword') {
      if (v.isFusion) {
        dmgHtml = bodyN != null ? pvpItem(v.bodyVaries ? '平均单发弹丸伤害' : '单发弹丸伤害', roundPvpDamage(bodyN), '', 'body') : '';
      } else if (v.blastInfo) {
        var impNow = v.ttkData.impactDmg * (S.pvpStat > 100 ? 1 + 5e-4 * (S.pvpStat - 100) : 1) * ((v.aa && v.aa.dmg) || 1);
        var blastNow = (bodyN || 0) - impNow;
        dmgHtml = pvpItem('直击伤害', roundPvpDamage(impNow), '', 'impact') +
          pvpItem('爆炸伤害 <span class="pvp-sub">(' + v.blastInfo.blastValue + ')</span>', roundPvpDamage(blastNow), '', 'blast');
      } else {
        var bLbl = effW.areaDenial ? '平均事件伤害' : effW.isShotgun ? '单颗弹丸直击'
          : !sameDmg ? (v.bodyVaries ? '平均直击伤害' : '直击伤害') : '伤害';
        dmgHtml = bodyN != null ? pvpItem(bLbl, roundPvpDamage(bodyN), '', 'body') : '';
        if (!sameDmg && critN != null) {
          var cLbl = effW.isShotgun ? '单颗弹丸精准' : (v.headVaries ? '平均精准伤害' : '精准伤害');
          dmgHtml += pvpItem(cLbl, roundPvpDamage(critN), '', 'crit');
        }
      }
    }
    var rpmHtml = '';
    if (v.dispRpm != null) {
      var rLbl = effW.isBow ? '蓄力时间' : effW.isChargeTime ? '充能时间' : '射速';
      var rVal = effW.isChargeTime ? Math.round(useLive && pvpShown.rpm != null ? pvpShown.rpm : v.dispRpm) + 'ms'
        : String(Math.round(useLive && pvpShown.rpm != null ? pvpShown.rpm : v.dispRpm));
      rpmHtml = pvpItem(rLbl, rVal, '', 'rpm');
    }
    var rangeHtml = '';
    if (rm) {
      var hDisp = useLive && pvpShown.hip != null ? pvpShown.hip : rm.hip;
      var aDisp = useLive && pvpShown.ads != null ? pvpShown.ads : rm.ads;
      rangeHtml = '<div class="pvp-stat-item pvp-range-row"><span class="pvp-stat-label">射程 <span class="pvp-sub">(' +
        v.rangeStat + ')</span></span><span class="pvp-stat-value">' + rangeFalloffSvg(rm) +
        '<span class="pvp-range-hip" data-pvp="hip">' + fmtM(hDisp) +
        '</span><span class="pvp-range-sep">/</span><span class="pvp-range-ads" data-pvp="ads">' + fmtM(aDisp) + '</span></span></div>';
    }
    var reloadHtml = '';
    if (rs != null) {
      var relDisp = useLive && pvpShown.reload != null ? pvpShown.reload : rs;
      reloadHtml = '<div class="pvp-stat-item"><span class="pvp-stat-label">填装 <span class="pvp-sub">(' +
        v.reloadStat + ')</span></span><span class="pvp-stat-value" data-pvp="reload">' + fmtS(relDisp) + '</span></div>';
    }
    var handHtml = '';
    if (v.handCur) {
      var rdy = useLive && pvpShown.ready != null ? pvpShown.ready : v.handCur.ready;
      var stw = useLive && pvpShown.stow != null ? pvpShown.stow : v.handCur.stow;
      var ads = useLive && pvpShown.hAds != null ? pvpShown.hAds : v.handCur.ads;
      handHtml = '<div class="pvp-stat-item"><span class="pvp-stat-label">操控 <span class="pvp-sub">(' +
        v.handStat + ')</span></span><span class="pvp-stat-value">' +
        '<span data-pvp="ready">' + fmtS(rdy) + '</span><span class="pvp-handling-sep"> / </span>' +
        '<span data-pvp="stow">' + fmtS(stw) + '</span><span class="pvp-handling-sep"> / </span>' +
        '<span data-pvp="hads">' + fmtS(ads) + '</span></span></div>';
    }
    var magHtml = '';
    if (v.magStart != null && v.magStart > 0) {
      magHtml = '<div class="pvp-stat-item"><span class="pvp-stat-label pvp-magazine-label"><span>起始弹匣' +
        '<button type="button" class="pvp-crit-reset" data-act="pvpmagreset" title="重置为满弹匣 (' + v.magMax + ')"' +
        (v.magStart !== v.magMax ? '' : ' hidden') + '>↺</button></span>' +
        '<input class="pvp-numeric-input pvp-magazine-input" type="number" inputmode="numeric" min="1" max="' + v.magMax +
        '" step="1" style="width:' + (S.pvpMagBlank ? 1 : String(v.magStart).length) + 'ch" value="' +
        (S.pvpMagBlank ? '' : v.magStart) + '" data-act="pvpmagnum" aria-label="起始弹匣数">' +
        '</span></div>' +
        '<div class="pvp-slat"><input class="pvp-crit-range" type="range" min="1" max="' + v.magMax +
        '" step="1" value="' + v.magStart + '" data-act="pvpmag" aria-label="起始弹匣滑动条"></div>';
    }
    var notesHtml = effW.notes ? '<div class="pvp-stat-notes">' + esc(effW.notes) + '</div>' : '';
    var perksBlock = pvpPerkBadges(v.showPerks, v.flatBadges, v.tyEn, effW);
    return '<div class="pvp-stats">' +
      '<div class="pvp-stat-hero"><span class="pvp-stat-label">' + heroLabel + '</span>' +
      '<span class="pvp-stat-hero-value" data-pvp="ttk">' +
      pvpHeroHtml(v, ttkShow, useLive ? pvpShown.bursts : v.bursts, useLive ? pvpShown.hits : v.hits, useLive ? pvpShown.pelKill : v.pelletsToKill, v.pelletsPerShot) +
      '</span></div>' +
      (v.tyEn !== 'Sword' ? pvpItem('最优击杀', esc(v.kill), '', 'kill') : '') +
      hitOrAccHtml + dmgHtml + rpmHtml + rangeHtml + reloadHtml + handHtml + magHtml + notesHtml +
      '<div class="pvp-weapon-stat">' +
      '<div class="pvp-stat-item"><span class="pvp-stat-label pvp-magazine-label"><span>武器属性' +
      '<button type="button" class="pvp-crit-reset" data-act="pvpstatreset" title="重置为 0"' +
      (S.pvpStat === 0 ? ' hidden' : '') + '>↺</button></span>' +
      '<input class="pvp-numeric-input pvp-stat-input" type="number" inputmode="numeric" min="0" max="200" step="1" value="' +
      S.pvpStat + '" data-act="pvpstatnum" aria-label="武器属性数值">' +
      '</span></div>' +
      '<div class="pvp-slat"><input class="pvp-crit-range" type="range" min="0" max="200" step="1" value="' + S.pvpStat +
      '" data-act="pvpstat" aria-label="武器属性滑动条"></div>' +
      '<div class="pvp-weapon-stat-description" data-pvp="wnote">' + pvpWeaponStatNoteHtml(v) + '</div>' +
      '</div>' +
      '<div class="pvp-damage-perks" data-pvp="perks"' + (perksBlock ? '' : ' hidden') + '>' + perksBlock + '</div>' +
      '</div>';
  }

  return {
    pvpPanel: pvpPanel,
    kickPvpAnim: kickPvpAnim,
    refreshPvpNumbers: refreshPvpNumbers,
    getTtkData: getTtkData,
    pvpView: pvpView,
    getPerkDamageModifier: getPerkDamageModifier,
    PVP_DISABLED: PVP_DISABLED,
    PVP_STRIP_DMG: PVP_STRIP_DMG
  };
};
