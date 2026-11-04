import {AsyncLocalStorage} from 'node:async_hooks'
export const flowContext=new AsyncLocalStorage<{actor:string;org:string;requestKey?:string}>()
const modules:Record<string,string>={receipts:'receipts',budgets:'budgets',reminders:'reminders',bills:'reminders',clients:'clients',projects:'projects',client_payments:'income',invoices:'invoices',inventory_items:'inventory',inventory_movements:'inventory'}
export const flowEnabled=()=>process.env.TRUEFLOW_ENHANCEMENTS_ENABLED==='true'
export const runFlowActor=<T>(actor:string,org:string,fn:()=>Promise<T>,requestKey?:string)=>flowContext.run({actor,org,requestKey},fn)
export const flowFetch:typeof fetch=async(input,init)=>{
 const ctx=flowContext.getStore();const h=new Headers(init?.headers??(input instanceof Request?input.headers:undefined))
 if(!ctx||!flowEnabled())return fetch(input,init)
 h.set('x-trueflow-actor',ctx.actor)
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 const table=url.pathname.match(/\/rest\/v1\/([^/]+)$/)?.[1];let module=table?modules[table]:null
 if(!module)return fetch(input,{...init,headers:h})
 const r=await fetch(new URL('/rest/v1/rpc/flow_access_snapshot',url),{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({p_actor:ctx.actor,p_org:ctx.org})})
 if(!r.ok)throw new Error('Enhanced permissions are unavailable.')
 const access=await r.json() as Record<string,{enabled:boolean;actions:string[];scope:string}>
 const method=(init?.method??'GET').toUpperCase();const read=method==='GET'||method==='HEAD'
 const action=read?'view':method==='POST'?'create':method==='DELETE'?'archive':'edit'
 if(table==='clients' && url.searchParams.get('status')==='eq.lead')module='leads'
 const rule=access[module]
 if(!rule?.enabled||!rule.actions.includes(action)||(action!=='create'&&!rule.actions.includes('view')))return read?new Response('[]',{headers:{'Content-Type':'application/json','Content-Range':'*/0'}}):new Response(JSON.stringify({message:'Module permission denied.'}),{status:403,headers:{'Content-Type':'application/json'}})
 url.searchParams.set('org_id','eq.'+ctx.org)
 if(rule.scope!=='all')url.searchParams.set(rule.scope==='own'?'created_by':'assigned_to','eq.'+ctx.actor)
 if(table==='clients' && !access.leads?.actions.includes(action) && module==='clients')url.searchParams.set('status','neq.lead')
 if(table==='receipts'&&read)url.searchParams.set('voided_at','is.null')
 if(table==='budgets'&&read)url.searchParams.set('archived_at','is.null')
 if(read){
  const selected=url.searchParams.get('select')??'*'
  for(const [related,relatedModule] of Object.entries(modules)){
   if(!new RegExp('(?:^|[,:(])'+related+'(?:![a-z_]+)?\\(').test(selected))continue
   const permission=access[relatedModule]
   if(!permission?.enabled||!permission.actions.includes('view'))return new Response('[]',{headers:{'Content-Type':'application/json','Content-Range':'*/0'}})
   url.searchParams.set(related+'.org_id','eq.'+ctx.org)
   if(permission.scope!=='all')url.searchParams.set(related+'.'+(permission.scope==='own'?'created_by':'assigned_to'),'eq.'+ctx.actor)
  }
 }
 return fetch(url,{...init,headers:h})
}
export async function flowAssistantAllowed(actor:string,org:string){
 if(!flowEnabled())return true
 const response=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/flow_access_snapshot',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor,p_org:org})})
 if(!response.ok)return false
 const rules=await response.json() as Record<string,{enabled:boolean;actions:string[]}>
 return !!rules.assistant?.enabled&&rules.assistant.actions.includes('view')
}
