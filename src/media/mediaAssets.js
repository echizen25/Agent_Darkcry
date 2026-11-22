import path from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir,writeFile,readFile,rename,rm,lstat,realpath } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fail,validId } from './mediaCore.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function inspectMedia(bytes,mimeType){
 if(!Buffer.isBuffer(bytes)||bytes.length<44||bytes.length>2000000)throw fail('MEDIA_ASSET_SIZE');
 if(mimeType==='image/png'){
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')throw fail('MEDIA_SIGNATURE');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>4096||height>4096)throw fail('MEDIA_DIMENSIONS');
  let offset=8,ended=false,data=[],ihdr=false;const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(size>bytes.length-offset-12||crc(bytes.subarray(offset+4,offset+8+size))!==bytes.readUInt32BE(offset+8+size))throw fail('MEDIA_SIGNATURE');if(type==='IHDR'){if(ihdr||size!==13||bytes[offset+16]!==8||bytes[offset+17]!==2)throw fail('MEDIA_PNG_FORMAT');ihdr=true;}if(type==='IDAT')data.push(bytes.subarray(offset+8,offset+8+size));offset+=12+size;if(type==='IEND'){ended=true;break;}}
  if(!ended||offset!==bytes.length||!data.length)throw fail('MEDIA_SIGNATURE');try{if(inflateSync(Buffer.concat(data),{maxOutputLength:50000000}).length!==(width*3+1)*height)throw fail('MEDIA_SIGNATURE');}catch{throw fail('MEDIA_SIGNATURE');}
  return {type:'IMAGE',mimeType,extension:'png',width,height,duration:null};
 }
 if(mimeType==='audio/wav'){
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.toString('ascii',12,16)!=='fmt '||bytes.readUInt16LE(20)!==1||bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44||bytes.readUInt32LE(4)!==bytes.length-8)throw fail('MEDIA_SIGNATURE');
  const rate=bytes.readUInt32LE(28),duration=(bytes.length-44)/rate;if(!rate||duration<=0||duration>180)throw fail('MEDIA_DURATION');return {type:'AUDIO',mimeType,extension:'wav',duration,width:null,height:null};
 }
 throw fail('MEDIA_UNSUPPORTED_FORMAT');
}
export class MediaAssetRegistry {
 constructor({root,store}){this.root=path.resolve(root,'data','media');this.store=store;this.store.state.mediaAssets||=[];}
 async directory(...parts){
  if(parts.some(v=>!uuid(v)))throw fail('MEDIA_SCOPE_INVALID');
  const parent=path.dirname(this.root);await mkdir(parent,{recursive:true});if ((await lstat(parent)).isSymbolicLink() || path.resolve(await realpath(parent)) !== parent) throw fail('MEDIA_PATH'); await mkdir(this.root,{recursive:true});
  if((await lstat(this.root)).isSymbolicLink()||path.resolve(await realpath(this.root))!==this.root)throw fail('MEDIA_PATH');
  let current=this.root;for(const part of parts){current=path.join(current,part);await mkdir(current,{recursive:true});if((await lstat(current)).isSymbolicLink()||path.resolve(await realpath(current))!==current)throw fail('MEDIA_PATH');}return current;
 }
 async register({projectId,missionId,runId,planId,origin='GENERATED',providerId,model,bytes,mimeType,generationFingerprint,sourceAssetIds=[],evidenceRefs=[],signal}){
  if(!validId(planId)||!['GENERATED','USER_PROVIDED','PROJECT_SOURCE','DERIVED'].includes(origin)||!Array.isArray(sourceAssetIds)||sourceAssetIds.length>12||!Array.isArray(evidenceRefs)||evidenceRefs.length>12||evidenceRefs.some(v=>!validId(v)))throw fail('MEDIA_ASSET_INVALID');
  for(const a of sourceAssetIds)this.get(a,projectId);
  const dir=await this.directory(projectId,missionId,runId),assetId=randomUUID(),quarantine=path.join(dir,assetId+'.quarantine');await writeFile(quarantine,bytes,{flag:'wx'});
  try{const info=inspectMedia(await readFile(quarantine),mimeType);if(signal?.aborted)throw fail('MEDIA_CANCELLED');const filename=assetId+'.'+info.extension;await rename(quarantine,path.join(dir,filename));const item={schemaVersion:1,assetId,projectId,missionId,runId,planId,origin,provider:providerId||null,model:model||null,...info,filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),generationFingerprint:generationFingerprint||null,sourceAssetIds,evidenceRefs,approvalState:'GENERATION_ALLOWED',createdAt:new Date().toISOString()};this.store.state.mediaAssets.push(item);await this.store.save();return item;}finally{await rm(quarantine,{force:true});}
 }
 get(assetId,projectId){const a=this.store.state.mediaAssets.find(v=>v.assetId===assetId&&v.projectId===projectId);if(!a||!uuid(assetId)||!projectId)throw fail('MEDIA_ASSET_NOT_FOUND');return a;}
 async download(assetId,projectId,{preview=false}={}){
  const a=this.get(assetId,projectId);if(!preview&&a.approvalState!=='APPROVED')throw fail('MEDIA_ASSET_NOT_RELEASED');const dir=await this.directory(a.projectId,a.missionId,a.runId);if(a.filename!==a.assetId+'.'+a.extension)throw fail('MEDIA_PATH');const file=path.join(dir,a.filename);if((await lstat(file)).isSymbolicLink())throw fail('MEDIA_PATH');const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw fail('MEDIA_ASSET_CHANGED');inspectMedia(bytes,a.mimeType);return {...a,path:file};
 }
}
