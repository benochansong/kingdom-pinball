import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import {
  pathSafety,
  validatePlacement,
} from "../src/building/PlacementValidator";
import { BuildingManager } from "../src/building/BuildingManager";
import { EconomyManager } from "../src/economy/EconomyManager";
import {
  EconomySaveManager,
  freshEconomy,
  sanitizeEconomy,
} from "../src/economy/EconomySaveManager";
import { GameStateManager } from "../src/core/GameStateManager";
import { applyBuildings,buildingImpulse } from '../src/building/BuildingPhysicsAdapter';
import { PinballPhysics } from '../src/physics/PinballPhysics';
import { TestBallSimulator } from '../src/building/TestBallSimulator';
import type { BuildingEntity } from '../src/building/types';
import { activeSynergies } from '../src/building/BuildingManager';
import { freshProduction } from "../src/building/types";
const item = { type: "woodDeflector", x: 300, y: 340, angle: 45, level: 1 };
const manager = () => {
  const e = new EconomyManager(freshEconomy(), new EconomySaveManager());
  const b = new BuildingManager(e);
  b.enter();
  return b;
};
describe("Kingdom builder", () => {
  it('rotates actual reflector geometry and changes the reflected trajectory',()=>{
    const run=(angle:number)=>{const p=new PinballPhysics([]);const b:BuildingEntity={...item,angle,x:290,y:400,id:'building-1',paid:{},production:freshProduction(),charge:0,lastHit:-1e4,readyAt:0};applyBuildings(p,[b]);p.spawn();p.launch(0);Matter.Body.setPosition(p.ball!,{x:290,y:350});Matter.Body.setVelocity(p.ball!,{x:0,y:8});for(let i=0;i<35;i++)p.step(1/240);const result={...p.ball!.velocity};p.dispose();return result;};const flat=run(0),slant=run(45);expect(Math.abs(slant.x-flat.x)).toBeGreaterThan(2);
  });
  it('enforces directional acceleration, speed cap and minimum slow-field speed',()=>{const p=new PinballPhysics([]);p.spawn();p.launch(0);const b:BuildingEntity={...item,type:'booster',angle:0,id:'building-1',paid:{},production:freshProduction(),charge:0,lastHit:-1e4,readyAt:0};Matter.Body.setVelocity(p.ball!,{x:-5,y:0});buildingImpulse(p,b);expect(p.ball!.velocity.x).toBe(-5);Matter.Body.setVelocity(p.ball!,{x:22,y:0});for(let i=0;i<100;i++)buildingImpulse(p,b);expect(p.ball!.speed*60).toBeLessThanOrEqual(1380.01);b.type='slow';for(let i=0;i<100;i++)buildingImpulse(p,b);expect(p.ball!.speed*60).toBeGreaterThanOrEqual(179.9);p.dispose();});
  it('keeps building goals one-shot and restores capacity bonuses on reload',()=>{const b=manager();b.build(item);expect(b.claim('first')).toBe(true);const gold=b.economy.data.resources.gold;expect(b.claim('first')).toBe(false);expect(b.economy.data.resources.gold).toBe(gold);const base=b.buildings[0];b.data.buildings.push({...structuredClone(base),id:'building-99',type:'warehouse',x:300,y:520,angle:0,level:5});b.economy.data.resources.wood=700;expect(sanitizeEconomy(b.economy.data)?.resources.wood).toBe(700);});
  it('requires nearby distinct buildings for synergies and does not stack them',()=>{const b=manager();b.data.buildings=[{...item,type:'lumber',x:260,y:340,id:'building-1',paid:{},production:freshProduction(),charge:0,lastHit:-1e4,readyAt:0},{...item,id:'building-2',paid:{},production:freshProduction(),charge:0,lastHit:-1e4,readyAt:0}];expect(activeSynergies(b.economy.data).filter(x=>x==='forest')).toHaveLength(1);b.data.buildings[1].x=580;b.data.buildings[1].y=880;expect(activeSynergies(b.economy.data)).not.toContain('forest');});
  it('measures a 20-static-building stress fixture without changing physics precision',()=>{const buildings:BuildingEntity[]=Array.from({length:20},(_,i)=>({...item,type:i%2?'wall':'bumper',x:100+(i%5)*90,y:150+Math.floor(i/5)*120,id:`building-${i+1}`,paid:{},production:freshProduction(),charge:0,lastHit:-1e4,readyAt:0}));const t=new TestBallSimulator(buildings);t.physics.launch(1);const started=performance.now();for(let i=0;i<3600;i++){t.physics.left.held=i%30<12;t.physics.right.held=i%37<15;t.update(1000/60);if(!t.physics.launched)t.physics.launch(.9);expect(Number.isFinite(t.physics.ball!.position.x)).toBe(true);expect(t.physics.ball!.speed*60).toBeLessThanOrEqual(1380.01);}console.info(`20-building physics: 60 simulated seconds in ${(performance.now()-started).toFixed(1)}ms; ${Matter.Composite.allBodies(t.physics.engine.world).length} bodies`);t.dispose();},15000);
  it("keeps original paths open and accepts the tutorial placement", () => {
    expect(pathSafety([])).toBeNull();
    expect(validatePlacement(item, [], ["central"])).toBeNull();
  });
  it("rejects launcher, flippers, fixed facilities, locked land and the current ball", () => {
    for (const p of [
      { x: 550, y: 400 },
      { x: 300, y: 780 },
      { x: 248, y: 451 },
      { x: 100, y: 400 },
    ])
      expect(
        validatePlacement({ ...item, ...p }, [], ["central"]),
      ).not.toBeNull();
    expect(
      validatePlacement(item, [], ["central"], { x: 300, y: 340 }),
    ).toContain("공 위치");
  });
  it("charges once, preserves IDs on paid move, refunds half actual investment, and undoes exactly", () => {
    const b = manager();
    const before = structuredClone(b.economy.data.resources);
    expect(b.build(item)).toBeNull();
    const id = b.buildings[0].id;
    expect(b.economy.data.resources.wood).toBe(20);
    expect(b.build(item)).not.toBeNull();
    expect(b.undo()).toBe(true);
    expect(b.economy.data.resources).toEqual(before);
    expect(b.buildings).toHaveLength(0);
    b.build(item);
    expect(b.move(b.buildings[0].id, { ...item, y: 400 })).toBeNull();
    expect(b.buildings[0].id).toBe(id);
    expect(b.economy.data.resources.wood).toBe(17);
    expect(b.demolish(id)).toBeNull();
    expect(b.economy.data.resources.wood).toBe(32);
    expect(b.demolish(id)).not.toBeNull();
  });
  it("validates preset costs atomically and never grants free buildings or upgrades", () => {
    const b = manager();
    const before = structuredClone(b.economy.data);
    expect(b.applyPreset([{ ...item, level: 5 }])).not.toBeNull();
    expect(b.economy.data).toEqual(before);
    expect(b.applyPreset([item])).toBeNull();
    expect(b.buildings).toHaveLength(1);
    expect(b.economy.data.resources.wood).toBe(20);
    b.leave();
    expect(b.undo()).toBe(false);
  });
  it("restores safe buildings from v3 and retains old economy saves", () => {
    const b = manager();
    b.build(item);
    expect(sanitizeEconomy(b.economy.data)?.building?.buildings).toHaveLength(
      1,
    );
    const old = { ...freshEconomy(), version: 2, building: undefined };
    expect(sanitizeEconomy(old)?.resources).toEqual(old.resources);
    expect(sanitizeEconomy(old)?.version).toBe(3);
  });
  it("uses independent production cooldowns for an added facility", () => {
    const b = manager();
    b.economy.data.building!.buildings.push({
      ...item,
      id: "building-9",
      type: "lumber",
      paid: {},
      production: freshProduction(),
      charge: 0,
      lastHit: -10000,
      readyAt: 0,
    });
    b.economy.data.launchState = "inflight";
    expect(b.economy.harvest("forest", 300, true)?.amount).toBe(10);
    expect(b.economy.harvest("building-9", 300, true)?.amount).toBe(10);
    expect(b.economy.harvest("building-9", 300, true)).toBeUndefined();
  });
  it("TEST BALL preserves real physics, timer, resources and progress", () => {
    const g = new GameStateManager();
    g.startKingdom(true);
    g.chargeStart();
    g.chargeRelease();
    g.update(100);
    g.enterBuild();
    const ball = g.physics.ball!,
      position = { ...ball.position },
      velocity = { ...ball.velocity },
      time = g.time;
    g.startTestBall();
    const saved = JSON.stringify(g.economy!.data);
    g.chargeStart();
    for (let i = 0; i < 60; i++) g.update(16);
    g.chargeRelease();
    for (let i = 0; i < 600; i++) g.update(16);
    expect(g.time).toBe(time);
    expect(JSON.stringify(g.economy!.data)).toBe(saved);
    expect(g.physics.ball).toBe(ball);
    expect(ball.position).toEqual(position);
    expect(ball.velocity).toEqual(velocity);
    g.stopTestBall();
    expect(g.leaveBuild()).toBeNull();
    expect(g.state).toBe("playing");
    g.dispose();
  });
  it("keeps static body count stable across repeated build and undo", () => {
    const g = new GameStateManager();
    g.startKingdom(true);
    g.enterBuild();
    const count = Matter.Composite.allBodies(g.physics.engine.world).length;
    for (let i = 0; i < 30; i++) {
      expect(g.builder!.build(item)).toBeNull();
      expect(Matter.Composite.allBodies(g.physics.engine.world)).toHaveLength(
        count + 1,
      );
      g.builder!.undo();
      expect(Matter.Composite.allBodies(g.physics.engine.world)).toHaveLength(
        count,
      );
    }
    g.dispose();
  });
});
