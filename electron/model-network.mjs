import {createHash} from 'node:crypto';
export function validateConnection(value){
 const mode=value.proxyMode??'auto',preset=value.headerPreset??'auto';
 if(!['auto','direct','system','custom'].includes(mode))throw Error('不支持的代理模式');
 if(!['auto','standard','opencode'].includes(preset))throw Error('不支持的请求头预设');
 let proxyUrl=String(value.proxyUrl||'').trim();
 if(mode==='custom'){
  let url;try{url=new URL(proxyUrl);}catch{throw Error('请输入完整代理地址，例如 http://127.0.0.1:7890');}
  if(!['http:','https:','socks5:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('代理地址仅支持无账号密码的 HTTP、HTTPS 或 SOCKS5 地址');
  proxyUrl=url.origin==='null'?url.protocol+'//'+url.host:url.origin;
 }
 let customHeaders=value.customHeaders??'{}';
 if(typeof customHeaders==='string'){try{customHeaders=JSON.parse(customHeaders||'{}');}catch{throw Error('自定义请求头必须是 JSON 对象');}}
 if(!customHeaders||Array.isArray(customHeaders)||typeof customHeaders!=='object')throw Error('自定义请求头必须是 JSON 对象');
 const clean={};
 for(const [name,v] of Object.entries(customHeaders)){
  if(!/^[!#$%&'*+\-.^_\x60|~0-9a-z]+$/i.test(name)||typeof v!=='string'||/[^\x20-\x7e\t]/.test(v))throw Error('请求头名称或内容无效，不允许换行');
  if(/^(host|content-length|connection|transfer-encoding|proxy-authorization|proxy-connection|cookie|set-cookie)$/i.test(name))throw Error('不支持覆盖此请求头：'+name);
  clean[name.toLowerCase()]=v;
 }
 if(JSON.stringify(clean).length>16384)throw Error('自定义请求头过长');
 return {proxyMode:mode,proxyUrl,headerPreset:preset,customHeaders:JSON.stringify(clean)};
}
export function completionUrl(base){const url=new URL(String(base).trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('模型地址应是 HTTP/HTTPS 接口地址，不含密码、查询参数或片段');url.pathname=url.pathname.replace(/\/+$/,'');if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';return url.toString();}
export function modelHeaders({url,apiKey,preset='auto',customHeaders='{}',sessionId,version}){
 const headers={'authorization':'Bearer '+apiKey,'content-type':'application/json','user-agent':'daily-intake-desktop/'+version};
 if(preset==='opencode'||(preset==='auto'&&new URL(url).hostname==='opencode.ai'))headers['x-opencode-session']=sessionId;
 Object.assign(headers,JSON.parse(validateConnection({customHeaders}).customHeaders));
 return headers;
}
export function proxyConnectionFailed(error){return /ERR_PROXY_CONNECTION_FAILED|ERR_NO_SUPPORTED_PROXIES|ERR_CONNECTION_REFUSED/.test(String(error?.message||error));}
export function createModelTransport(session){
 const sessions=new Map();
 async function get(mode,proxyUrl){
  const key=mode==='custom'?'custom-'+createHash('sha256').update(proxyUrl).digest('hex'):mode;
  if(!sessions.has(key)){const s=session.fromPartition('model-network-'+key,{cache:false});sessions.set(key,(async()=>{await s.setProxy(mode==='direct'?{mode:'direct'}:mode==='custom'?{mode:'fixed_servers',proxyRules:proxyUrl,proxyBypassRules:'<-loopback>'}:{mode:'system'});return s;})());}
  return sessions.get(key);
 }
 return async function request(url,init,config){
  const mode=config.proxyMode||'auto',s=await get(mode==='auto'?'system':mode,config.proxyUrl||'');
  if(mode==='auto'||mode==='system')await s.forceReloadProxyConfig();
  const route=await s.resolveProxy(url);
  try{return await s.fetch(url,{...init,credentials:'omit',redirect:'error'});}
  catch(error){
   if(mode==='auto'&&route!=='DIRECT'&&proxyConnectionFailed(error)&&!init.signal?.aborted){
    try{return await (await get('direct','')).fetch(url,{...init,credentials:'omit',redirect:'error'});}
    catch{throw Error('系统代理无法连接，自动直连也未成功。请检查网络或在模型设置中指定可用代理。');}
   }
   if(init.signal?.aborted)throw Error('模型请求超时，请检查网络或稍后重试');
   throw Error((mode==='custom'?'指定代理连接失败，请确认代理已启动且端口正确。':mode==='direct'?'直连模型服务失败，可尝试自动或系统代理模式。':'模型连接失败，请检查系统代理或选择直连。')+' '+String(error.message||error));
  }
 };
}
