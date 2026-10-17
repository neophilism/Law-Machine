import { canonicalDigest, canonicalJSON } from '../../contracts/src/integrity.ts';
/** LM-026 deterministic, noncryptographic simulation random streams. Never use for security. */
export type ReplayDescriptor={readonly engineVersion:string;readonly calendarVersion:string;readonly modelDigest:string;readonly scenarioId:string;readonly seed:number;readonly facts:unknown};
export type ReplayCheckpoint={readonly label:string;readonly digest:string};
const identifier=(x:unknown)=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(x);
const sha=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function validateReplayDescriptor(d:ReplayDescriptor):void {
 if(!d||!identifier(d.engineVersion)||!identifier(d.calendarVersion)||!sha(d.modelDigest)||!identifier(d.scenarioId)||!Number.isSafeInteger(d.seed)||d.seed<0||d.seed>0xffffffff)throw Error('INVALID_REPLAY_DESCRIPTOR');
 canonicalJSON(d.facts);
}
export async function runIdentity(d:ReplayDescriptor):Promise<string>{
 validateReplayDescriptor(d);
 return canonicalDigest({format:'law-machine-replay-v1',engineVersion:d.engineVersion,calendarVersion:d.calendarVersion,modelDigest:d.modelDigest,scenarioId:d.scenarioId,seed:d.seed,facts:d.facts});
}
/** xorshift32 is specified here to agree across JavaScript runtimes, not for unpredictability. */
export class ReplayStream{
 private state:number;
 constructor(seed:number,readonly namespace:string){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!(typeof namespace==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(namespace)))throw Error('INVALID_RANDOM_STREAM');
  this.state=(seed^0x9e3779b9)>>>0;
  if(!this.state)this.state=0x6d2b79f5;
 }
 nextUint32():number{
  let x=this.state;
  x^=x<<13;x^=x>>>17;x^=x<<5;
  this.state=x>>>0;
  return this.state;
 }
 nextUnit():number{return this.nextUint32()/4294967296;}
 snapshot():number{return this.state;}
}
/** Independent named streams prevent extra events in one subsystem consuming another's randomness. */
export async function namedStream(d:ReplayDescriptor,name:string):Promise<ReplayStream>{
 validateReplayDescriptor(d);
 if(!identifier(name))throw Error('INVALID_STREAM_NAME');
 const digest=await canonicalDigest({version:1,run:await runIdentity(d),stream:name});
 const seed=Number.parseInt(digest.slice(0,8),16);
 return new ReplayStream(seed,name);
}
export function fixedRound(value:number,places=6):number{
 if(!Number.isFinite(value)||!Number.isSafeInteger(places)||places<0||places>9)throw Error('INVALID_ROUNDING');
 const scale=10**places;
 const scaled=value*scale;
 if(!Number.isSafeInteger(Math.round(scaled)))throw Error('ROUNDING_RANGE');
 return Math.round(scaled)/scale;
}
export async function checkpoint(label:string,events:unknown):Promise<ReplayCheckpoint>{
 if(!identifier(label))throw Error('INVALID_CHECKPOINT');
 return {label,digest:await canonicalDigest(events)};
}
export function exportReplay(d:ReplayDescriptor,checks:readonly ReplayCheckpoint[]):string{
 validateReplayDescriptor(d);
 if(!Array.isArray(checks)||checks.length>10000||checks.some(x=>!identifier(x.label)||!sha(x.digest)))throw Error('INVALID_CHECKPOINTS');
 return canonicalJSON({format:'law-machine-replay-v1',descriptor:d,checkpoints:checks});
}
export function importReplay(serialized:string):{readonly descriptor:ReplayDescriptor;readonly checkpoints:readonly ReplayCheckpoint[]}{
 if(typeof serialized!=='string'||serialized.length>2_000_000)throw Error('INVALID_REPLAY_SIZE');
 let x:unknown;
 try{x=JSON.parse(serialized);}catch{throw Error('INVALID_REPLAY_JSON');}
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_REPLAY');
 const v=x as Record<string,unknown>;
 if(v.format!=='law-machine-replay-v1'||!v.descriptor||typeof v.descriptor!=='object')throw Error('INCOMPATIBLE_REPLAY_FORMAT');
 const d=v.descriptor as ReplayDescriptor;
 validateReplayDescriptor(d);
 if(!Array.isArray(v.checkpoints)||v.checkpoints.length>10000||v.checkpoints.some(x=>!x||!identifier(x.label)||!sha(x.digest)))throw Error('INVALID_CHECKPOINTS');
 return {descriptor:d,checkpoints:v.checkpoints as ReplayCheckpoint[]};
}
