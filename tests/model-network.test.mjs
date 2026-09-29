import test from 'node:test';import assert from 'node:assert/strict';import {validateConnection,modelHeaders,completionUrl,createModelTransport} from '../electron/model-network.mjs';
test('OpenCode gets honest identity and stable conversation header; standard hosts do not',()=>{
 const input={url:'https://opencode.ai/zen/go/v1/chat/completions',apiKey:'test',sessionId:'session-a',version:'3.6.0'};
 const h=modelHeaders(input);assert.equal(h['x-opencode-session'],'session-a');assert.equal(h['user-agent'],'daily-intake-desktop/3.6.0');
 assert.equal(modelHeaders({...input,url:'https://example.com/v1/chat/completions'})['x-opencode-session'],undefined);
 assert.equal(modelHeaders({...input,customHeaders:'{"X-OpenCode-Session":"custom"}'})['x-opencode-session'],'custom');
 assert.equal(completionUrl('https://opencode.ai/zen/go/v1/'),'https://opencode.ai/zen/go/v1/chat/completions');
 assert.equal(completionUrl(input.url),input.url);
});
test('invalid configuration rejects header injection and unsafe connection fields',()=>{
 for(const customHeaders of ['[]','{"X-Test":"bad\\r\\nInjected: yes"}','{"Host":"other"}','{"X-Test":2}'])assert.throws(()=>validateConnection({customHeaders}));
 assert.throws(()=>validateConnection({proxyMode:'custom',proxyUrl:'http://user:pass@localhost:7890'}));
 assert.equal(validateConnection({proxyMode:'custom',proxyUrl:'socks5://127.0.0.1:7890'}).proxyUrl,'socks5://127.0.0.1:7890');
});
test('only auto mode retries a refused proxy, never HTTP errors or forced modes',async()=>{
 let calls=[],status=200,route='PROXY 127.0.0.1:7890',fail=true;
 const session={fromPartition:()=>{let mode;return {setProxy:async c=>{mode=c.mode},forceReloadProxyConfig:async()=>{},resolveProxy:async()=>mode==='direct'?'DIRECT':route,fetch:async()=>{calls.push(mode);if(mode!=='direct'&&fail)throw Error('net::ERR_PROXY_CONNECTION_FAILED');return {status}}}}};
 let transport=createModelTransport(session);
 await transport('https://example.com',{}, {proxyMode:'auto'});assert.deepEqual(calls,['system','direct']);
 calls=[];await assert.rejects(()=>transport('https://example.com',{}, {proxyMode:'system'}));assert.deepEqual(calls,['system']);
 fail=false;calls=[];status=500;assert.equal((await transport('https://example.com',{}, {proxyMode:'auto'})).status,500);assert.deepEqual(calls,['system']);
 fail=true;calls=[];route='DIRECT';await assert.rejects(()=>transport('https://example.com',{}, {proxyMode:'auto'}));assert.deepEqual(calls,['system']);
});
