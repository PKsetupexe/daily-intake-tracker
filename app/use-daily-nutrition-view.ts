"use client";
import {useEffect,useRef,useState} from 'react';
export function useDailyNutritionView(request:<T>(path:string,body?:object)=>Promise<T>,onError:(message:string)=>void){
 const [enabled,setEnabled]=useState(true),[ready,setReady]=useState(false),day=useRef(''),pending=useRef(false),errorHandler=useRef(onError);
 useEffect(()=>{errorHandler.current=onError;},[onError]);
 const localDay=()=>new Date().toLocaleDateString('en-CA');
 useEffect(()=>{let active=true;
 async function load(){if(pending.current||day.current===localDay())return;pending.current=true;try{const value=await request<{date:string;enabled:boolean}>('/api/nutrition/view');if(active){day.current=value.date;setEnabled(value.enabled);setReady(true);}}catch{if(active){setReady(false);errorHandler.current('近期视图设置读取失败，请稍后重试');}}finally{pending.current=false;}}
 const visible=()=>{if(document.visibilityState==='visible')void load();};
 void load();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const timer=setInterval(visible,30000);
 return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[request]);
 async function toggle(){if(!ready||pending.current)return;pending.current=true;setReady(false);const next=!enabled;try{const result=await request<{date:string;enabled:boolean}>('/api/nutrition/view',{enabled:next});day.current=result.date;setEnabled(result.enabled);}catch{errorHandler.current('近期视图设置保存失败，请重试');}finally{pending.current=false;setReady(true);}}
 return {enabled,ready,toggle};
}
