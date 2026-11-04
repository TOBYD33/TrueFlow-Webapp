import cron from 'node-cron'
let running=false
export async function dispatchInvoiceCollections(){
 if(running||process.env.TRUEFLOW_INVOICE_DISPATCH_ENABLED!=='true')return
 const origin=process.env.TRUEFLOW_INVOICE_APP_ORIGIN,secret=process.env.TRUEFLOW_INVOICE_CRON_SECRET
 if(!origin||!secret){console.error('Invoice dispatcher requires its application origin and worker credential');return}
 let url:URL;try{url=new URL('/api/invoice-collections/dispatch',origin);if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error()}catch{console.error('Invoice dispatcher origin is invalid');return}
 running=true
 try{const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(55000)});if(!response.ok)console.error('Invoice dispatch returned status',response.status)}catch{console.error('Invoice dispatch unavailable; pending work will be checked on the next cycle')}finally{running=false}
}
export function startInvoiceDispatcher(){if(process.env.TRUEFLOW_INVOICE_DISPATCH_ENABLED==='true')cron.schedule('* * * * *',()=>void dispatchInvoiceCollections(),{timezone:'UTC'})}
