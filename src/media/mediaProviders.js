import { deflateSync } from 'node:zlib';
import { CAPABILITIES, fail, hash, canonical } from './mediaCore.js';
export class MediaProviderRegistry {
 constructor(){this.providers=new Map();}
 register(p){if(!p||!p.id||!/^[-a-z0-9]{1,40}$/.test(p.id)||this.providers.has(p.id)||typeof p.generate!=='function'||typeof p.health!=='function'||!Array.isArray(p.capabilities)||p.capabilities.some(c=>!CAPABILITIES.includes(c)))throw fail('MEDIA_PROVIDER_INVALID');this.providers.set(p.id,p);return p;}
 get(id){const p=this.providers.get(id);if(!p)throw fail('MEDIA_NOT_CONFIGURED');return p;}
 async status({timeoutMs=1000}={}){return Promise.all([...this.providers.values()].slice(0,20).map(async p=>{let timer;try{const healthy=await Promise.race([Promise.resolve().then(()=>p.health()).then(Boolean).catch(()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),Math.min(timeoutMs,1000));})]);return {providerId:p.id,configured:p.configured===true,external:p.external===true,capabilities:p.capabilities,healthy};}finally{clearTimeout(timer);}}));}
}
export const generationFingerprint=r=>hash({provider:r.providerId,capability:r.capability,model:r.model,parameters:r.parameters,prompt:r.prompt,referenceHashes:r.referenceHashes});
export class MediaProviderGateway {
 constructor({registry=new MediaProviderRegistry(),timeoutMs=1000,maxConcurrent=2,maxRetries=1,maxOutputBytes=2000000}={}){this.registry=registry;this.timeoutMs=Math.min(timeoutMs,10000);this.maxConcurrent=Math.min(Math.max(maxConcurrent,1),4);this.maxRetries=Math.min(Math.max(maxRetries,0),2);this.maxOutputBytes=maxOutputBytes;this.active=0;this.calls=[];}
 async request(r,{signal,generationApproval=false}={}){
  const p=this.registry.get(r.providerId);
  if(!p.configured)throw fail('MEDIA_NOT_CONFIGURED');
  if(!CAPABILITIES.includes(r.capability)||!p.capabilities.includes(r.capability))throw fail('MEDIA_UNSUPPORTED_CAPABILITY');
  if(p.external&&!generationApproval)throw fail('MEDIA_GENERATION_APPROVAL_REQUIRED');
  if(canonical(r).length>12000||typeof r.prompt!=='string'||r.prompt.length>2000||!Array.isArray(r.referenceHashes)||r.referenceHashes.length>12||r.referenceHashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw fail('MEDIA_REQUEST_BOUNDS');
  if(this.active>=this.maxConcurrent)throw fail('MEDIA_BUSY');
  if(signal?.aborted)throw fail('MEDIA_CANCELLED');
  this.active++;
  try{for(let attempt=0;attempt<=this.maxRetries;attempt++){
   if(signal?.aborted)throw fail('MEDIA_CANCELLED');
   const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,this.timeoutMs);
   const call={providerId:p.id,capability:r.capability,fingerprint:generationFingerprint(r),attempt,status:'RUNNING',startedAt:new Date().toISOString()};this.calls.push(call);if(this.calls.length>200)this.calls.shift();
   try{const out=await Promise.race([Promise.resolve().then(()=>p.generate(r,{signal:controller.signal})),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(fail(signal?.aborted?'MEDIA_CANCELLED':'MEDIA_TIMEOUT')),{once:true}))]);
    if(controller.signal.aborted)throw fail(signal?.aborted?'MEDIA_CANCELLED':'MEDIA_TIMEOUT');
    if(!out||!Buffer.isBuffer(out.bytes)||!out.bytes.length||out.bytes.length>this.maxOutputBytes||typeof out.mimeType!=='string')throw fail('MEDIA_INVALID_OUTPUT');
    call.status='SUCCESS';return {bytes:out.bytes,mimeType:out.mimeType,generationFingerprint:call.fingerprint,providerId:p.id,model:r.model};
   }catch(e){call.status='ERROR';const code=['MEDIA_TIMEOUT','MEDIA_CANCELLED','MEDIA_RATE_LIMIT','MEDIA_INVALID_OUTPUT'].includes(e.code)?e.code:'MEDIA_PROVIDER_FAILED';call.errorCode=code;if(attempt===this.maxRetries||!['MEDIA_TIMEOUT','MEDIA_RATE_LIMIT','MEDIA_PROVIDER_FAILED'].includes(code))throw fail(code);}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);call.completedAt=new Date().toISOString();}
  }}finally{this.active--;}
 }
}
// Valid small PNG fixtures, built locally; fake provider is injected only by tests.
const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const n=Buffer.from(name),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);n.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([n,data])),8+data.length);return out;};
export function fixturePNG(width=160,height=90){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=2;const rows=Buffer.alloc((width*3+1)*height,80);for(let i=0;i<height;i++)rows[i*(width*3+1)]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
export class FakeMediaProvider {
 constructor({behavior='success',external=false}={}){this.id='fake';this.configured=true;this.external=external;this.capabilities=['IMAGE_GENERATION','VOICE_GENERATION','AUDIO_GENERATION'];this.behavior=behavior;this.calls=0;}
 async health(){return true;}
 async generate(r){this.calls++;if(this.behavior==='timeout')return new Promise(()=>{});if(this.behavior==='failure')throw fail('MEDIA_PROVIDER_FAILED');if(this.behavior==='rate-limit')throw fail('MEDIA_RATE_LIMIT');if(this.behavior==='invalid-output')return {bytes:Buffer.from('bad'),mimeType:'image/png'};const [w,h]=r.parameters.aspectRatio.split(':').map(Number);return r.capability === 'IMAGE_GENERATION' ? {bytes:fixturePNG(w*10,h*10),mimeType:'image/png'} : {bytes:fixtureWAV(r.parameters.duration || 10),mimeType:'audio/wav'};}
}


export function fixtureWAV(duration=10) { const size=Math.round(duration*8000),b=Buffer.alloc(44+size,128); b.write('RIFF'); b.writeUInt32LE(size+36,4); b.write('WAVE',8); b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(8000,24); b.writeUInt32LE(8000,28); b.writeUInt16LE(1,32); b.writeUInt16LE(8,34); b.write('data',36); b.writeUInt32LE(size,40); return b; }
