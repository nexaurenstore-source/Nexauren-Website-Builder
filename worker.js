import { billingCatalog, billingAccount, billingCreateCheckout, billingPaymentStatus, billingFinalizePayment, billingCurrentUser } from './billing-core.js';
import { createPayPalProvider } from './paypal-provider.js';

/* Nexauren Website Builder Worker — subscription-only billing. */
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const cors=r=>({'access-control-allow-origin':r.headers.get('Origin')||'*','access-control-allow-credentials':'true','access-control-allow-headers':'Content-Type, Accept, Authorization','access-control-allow-methods':'GET,POST,OPTIONS'});

async function handlePaymentVerification(request,env,user){
  const d=await request.json().catch(()=>null); const reference=String(d?.reference||'').trim();
  if(!reference)return json({error:'reference is required.'},400,cors(request));
  const payment=await env.DB.prepare('SELECT id,user_id,provider,provider_transaction_id,reference,amount_minor,currency,status,type,metadata FROM payments WHERE user_id=?1 AND reference=?2 LIMIT 1').bind(user.id,reference).first();
  if(!payment)return json({error:'Payment not found.'},404,cors(request));
  if(payment.status==='successful')return json({success:true,payment},200,cors(request));
  if(String(payment.provider).toLowerCase()!=='paypal')return json({error:'Payment provider mismatch.'},409,cors(request));
  if(payment.type!=='subscription')return json({error:'Website Builder supports subscriptions only.'},409,cors(request));
  const provider=createPayPalProvider(); let metadata={}; try{metadata=JSON.parse(payment.metadata||'{}')}catch{}
  try{
    const subscriptionId=String(payment.provider_transaction_id||'');
    if(!subscriptionId)return json({error:'Subscription is not associated with this payment.'},409,cors(request));
    const details=await provider.getSubscription({env,subscriptionId});
    const status=String(details?.status||'').toUpperCase();
    if(status!=='ACTIVE')return json({success:false,pending:true,payment,subscription:{id:subscriptionId,status}},200,cors(request));
    const planId=String(metadata.product_id||'');
    const plan=await env.DB.prepare('SELECT id,price_minor,currency FROM plans WHERE id=?1 AND enabled=1 LIMIT 1').bind(planId).first();
    if(!plan)return json({error:'Subscription plan not found.'},409,cors(request));
    if(Number(plan.price_minor)!==Number(payment.amount_minor)||String(plan.currency).toUpperCase()!==String(payment.currency).toUpperCase())return json({error:'Subscription plan price mismatch.'},409,cors(request));
    const now=Math.floor(Date.now()/1000);
    const start=details?.start_time?Math.floor(new Date(details.start_time).getTime()/1000):now;
    const next=details?.billing_info?.next_billing_time?Math.floor(new Date(details.billing_info.next_billing_time).getTime()/1000):null;
    const local=await env.DB.prepare("SELECT id FROM subscriptions WHERE provider='paypal' AND provider_subscription_id=?1 LIMIT 1").bind(subscriptionId).first();
    if(local)await env.DB.prepare("UPDATE subscriptions SET plan_id=?1,status='active',start_date=?2,next_billing_date=?3,current_period_start=?2,current_period_end=?3,updated_at=?4 WHERE id=?5").bind(planId,start,next,now,local.id).run();
    await env.DB.prepare('UPDATE billing_accounts SET plan_id=?1,updated_at=?2 WHERE user_id=?3').bind(planId,now,user.id).run();
    await env.DB.prepare("UPDATE payments SET status='successful',updated_at=?1 WHERE id=?2").bind(now,payment.id).run();
    return json({success:true,payment:{...payment,status:'successful'},subscription:{id:subscriptionId,status:'ACTIVE',plan_id:planId,start_date:start,next_billing_date:next}},200,cors(request));
  }catch(error){console.error('Builder subscription verification',String(error));return json({error:'Unable to verify the PayPal subscription.'},502,cors(request));}
}

async function handleRequest(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
  const url=new URL(request.url);
  if(url.pathname==='/api/health')return json({ok:true,service:'nexauren-website-builder'},200,cors(request));
  if(url.pathname==='/api/billing/catalog'&&request.method==='GET')return json(await billingCatalog(env),200,cors(request));
  if(url.pathname==='/api/billing/account'&&request.method==='GET'){const u=await billingCurrentUser(request,env);if(!u)return json({error:'Authentication required.'},401,cors(request));return json(await billingAccount(env,u.id),200,cors(request));}
  if(url.pathname==='/api/billing/checkout'&&request.method==='POST'){const u=await billingCurrentUser(request,env);if(!u)return json({error:'Authentication required.'},401,cors(request));const d=await request.json().catch(()=>null);try{return json(await billingCreateCheckout(env,request,u,'subscription',String(d?.product_id||'')),201,cors(request));}catch(e){console.error('Builder checkout',String(e));return json({error:'Unable to create subscription checkout.',code:'checkout_failed',detail:String(e.message||e).slice(0,300)},502,cors(request));}}
  if(url.pathname==='/api/billing/payment'&&request.method==='POST'){const u=await billingCurrentUser(request,env);if(!u)return json({error:'Authentication required.'},401,cors(request));return handlePaymentVerification(request,env,u);}
  if(url.pathname==='/api/billing/payment'&&request.method==='GET'){const u=await billingCurrentUser(request,env);if(!u)return json({error:'Authentication required.'},401,cors(request));const ref=String(url.searchParams.get('reference')||'');if(!ref)return json({error:'reference is required.'},400,cors(request));const p=await billingPaymentStatus(env,u.id,ref);return p?json({payment:p},200,cors(request)):json({error:'Payment not found.'},404,cors(request));}
  if(url.pathname==='/api/billing/subscription/cancel'&&request.method==='POST'){const u=await billingCurrentUser(request,env);if(!u)return json({error:'Authentication required.'},401,cors(request));const sub=await env.DB.prepare("SELECT id,provider,provider_subscription_id,next_billing_date FROM subscriptions WHERE user_id=?1 AND status IN ('active','past_due') ORDER BY created_at DESC LIMIT 1").bind(u.id).first();if(!sub)return json({error:'No active subscription.'},404,cors(request));try{await createPayPalProvider().subscriptionAction({env,subscriptionId:sub.provider_subscription_id,action:'cancel'});const now=Math.floor(Date.now()/1000);await env.DB.prepare('UPDATE subscriptions SET cancel_at_period_end=1,updated_at=?1 WHERE id=?2').bind(now,sub.id).run();return json({success:true,cancel_at_period_end:true,current_period_end:sub.next_billing_date||null},200,cors(request));}catch(e){return json({error:'Unable to cancel subscription.'},502,cors(request));}}
  if(url.pathname.startsWith('/api/'))return json({error:'Not found.'},404,cors(request));
  if(env.ASSETS)return env.ASSETS.fetch(request);
  return new Response('Not found.',{status:404});
}
export default {fetch(request,env){return handleRequest(request,env)}};
