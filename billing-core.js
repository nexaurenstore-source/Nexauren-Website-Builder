import { createPayPalProvider } from './paypal-provider.js';

/* Nexauren Website Builder billing adapter — shared D1 billing model. */
const BILLING_PRODUCT_TYPES = new Set(['credit_purchase','subscription']);
const billingJson = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const billingUuid = () => crypto.randomUUID();
const billingClean = v => String(v ?? '').trim();

async function billingCurrentUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  let raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!raw) { const cookie = request.headers.get('Cookie') || ''; const m = cookie.match(/(?:^|;\s*)nexauren_session=([^;]+)/); raw = m ? decodeURIComponent(m[1]) : null; }
  if (!raw) return null;
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  const tokenHash = [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return env.DB.prepare('SELECT u.id,u.email,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?1 AND s.expires_at>?2 LIMIT 1').bind(tokenHash,Math.floor(Date.now()/1000)).first();
}
async function billingEnsureAccount(env,userId) {
  const now=Math.floor(Date.now()/1000); const free=await env.DB.prepare("SELECT id,credits_per_cycle FROM plans WHERE id='free' AND enabled=1 LIMIT 1").first();
  if(!free) throw new Error('Billing catalog is not initialized.'); const reference=`grant:free:${userId}`;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO billing_accounts(user_id,plan_id,created_at,updated_at) VALUES(?1,'free',?2,?2)").bind(userId,now),
    env.DB.prepare('INSERT OR IGNORE INTO credit_balances(user_id,balance,updated_at) VALUES(?1,0,?2)').bind(userId,now),
    env.DB.prepare("INSERT OR IGNORE INTO credit_transactions(id,user_id,amount,type,description,reference,payment_id,tool_id,created_at) VALUES(?1,?2,?3,'bonus','Free plan credits',?4,NULL,NULL,?5)").bind(billingUuid(),userId,Math.max(0,Number(free.credits_per_cycle||0)),reference,now),
    env.DB.prepare('UPDATE credit_balances SET balance=(SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE user_id=?1),updated_at=?2 WHERE user_id=?1').bind(userId,now)
  ]);
  return env.DB.prepare('SELECT ba.user_id,ba.plan_id,p.name AS plan_name,p.price_minor,p.currency,p.billing_interval,p.credits_per_cycle,COALESCE(cb.balance,0) AS balance FROM billing_accounts ba JOIN plans p ON p.id=ba.plan_id LEFT JOIN credit_balances cb ON cb.user_id=ba.user_id WHERE ba.user_id=?1 LIMIT 1').bind(userId).first();
}
async function billingCatalog(env) {
  const [plans,packages]=await Promise.all([
    env.DB.prepare('SELECT id,name,price_minor,currency,billing_interval,credits_per_cycle,enabled,paypal_product_id,paypal_plan_id FROM plans WHERE enabled=1 ORDER BY price_minor ASC').all(),
    env.DB.prepare('SELECT id,name,credits,price_minor,currency,enabled FROM credit_packages WHERE enabled=1 ORDER BY credits ASC').all()
  ]); return {provider:billingClean(env.PAYMENT_PROVIDER||'paypal').toLowerCase(),plans:plans.results||[],credit_packages:packages.results||[]};
}
async function billingAccount(env,userId){const account=await billingEnsureAccount(env,userId);const subscription=await env.DB.prepare('SELECT id,provider,provider_subscription_id,plan_id,status,start_date,next_billing_date,current_period_start,current_period_end,cancel_at_period_end FROM subscriptions WHERE user_id=?1 ORDER BY created_at DESC LIMIT 1').bind(userId).first();return{account,subscription:subscription||null};}
async function billingCreateCheckout(env,request,user,type,productId){
  if(!BILLING_PRODUCT_TYPES.has(type)||!productId)throw new Error('Invalid billing product.'); const table=type==='credit_purchase'?'credit_packages':'plans';
  const product=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?1 AND enabled=1 LIMIT 1`).bind(productId).first(); if(!product)throw new Error('Product not found.');
  if(type==='subscription'&&product.billing_interval==='none')throw new Error('Product is not a subscription.');
  if(!Number.isSafeInteger(Number(product.price_minor))||Number(product.price_minor)<0)throw new Error('Invalid product price.');
  const providerName=billingClean(env.PAYMENT_PROVIDER||'paypal').toLowerCase(); if(providerName!=='paypal')throw new Error('Payment provider not configured.');
  const provider=createPayPalProvider(); const reference=`order:${billingUuid()}`; const paymentId=billingUuid(); const now=Math.floor(Date.now()/1000);
  await env.DB.prepare("INSERT INTO payments(id,user_id,provider,provider_transaction_id,reference,amount_minor,currency,status,type,metadata,created_at,updated_at) VALUES(?1,?2,?3,NULL,?4,?5,?6,'pending',?7,?8,?9,?9)").bind(paymentId,user.id,providerName,reference,Number(product.price_minor),String(product.currency).toUpperCase(),type,JSON.stringify({product_id:productId}),now).run();
  try{const checkout=await provider.createCheckout({env,request,user,reference,product,productType:type});const providerId=billingClean(checkout?.transaction_id||checkout?.order_id||checkout?.subscription_id);await env.DB.prepare("UPDATE payments SET provider_transaction_id=?1,metadata=?2,updated_at=?3 WHERE id=?4 AND status='pending'").bind(providerId||null,JSON.stringify({product_id:productId,checkout_mode:checkout?.mode||null}),Math.floor(Date.now()/1000),paymentId).run();return{success:true,reference,checkout};}
  catch(error){await env.DB.prepare("UPDATE payments SET status='failed',metadata=?1,updated_at=?2 WHERE id=?3 AND status='pending'").bind(JSON.stringify({product_id:productId,error:String(error).slice(0,500)}),Math.floor(Date.now()/1000),paymentId).run();throw error;}
}
async function billingPaymentStatus(env,userId,reference){return env.DB.prepare('SELECT id,provider,reference,amount_minor,currency,status,type,provider_transaction_id,metadata,created_at,updated_at FROM payments WHERE user_id=?1 AND reference=?2 LIMIT 1').bind(userId,reference).first();}
async function billingAddCredits(env,{userId,amount,type,description,reference,paymentId=null,toolId=null}){const credits=Math.floor(Number(amount));if(!Number.isFinite(credits)||credits<=0)throw new Error('Invalid credit amount.');const now=Math.floor(Date.now()/1000);const result=await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO credit_transactions(id,user_id,amount,type,description,reference,payment_id,tool_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind(billingUuid(),userId,credits,type,billingClean(description).slice(0,240),reference,paymentId,toolId,now),env.DB.prepare('INSERT OR IGNORE INTO credit_balances(user_id,balance,updated_at) VALUES(?1,0,?2)').bind(userId,now),env.DB.prepare('UPDATE credit_balances SET balance=(SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE user_id=?1),updated_at=?2 WHERE user_id=?1').bind(userId,now)]);return{applied:Number(result?.[0]?.meta?.changes||0)>0};}
async function billingFinalizePayment(env,verified){const{provider,reference,providerTransactionId,status,userId,amountMinor,currency,type,productId,metadata={}}=verified||{};const payment=await env.DB.prepare('SELECT id,user_id,amount_minor,currency,type,status,provider,provider_transaction_id FROM payments WHERE reference=?1 LIMIT 1').bind(reference).first();if(!payment)throw new Error('Payment reference not found.');if(payment.user_id!==userId||payment.provider!==provider||Number(payment.amount_minor)!==Number(amountMinor)||String(payment.currency).toUpperCase()!==String(currency).toUpperCase()||payment.type!==type)throw new Error('Payment verification mismatch.');const now=Math.floor(Date.now()/1000);await env.DB.prepare('UPDATE payments SET provider_transaction_id=?1,status=?2,metadata=?3,updated_at=?4 WHERE reference=?5').bind(String(providerTransactionId),status,JSON.stringify(metadata),now,reference).run();if(status!=='successful')return{processed:false,status};if(type==='credit_purchase'){const existing=await env.DB.prepare('SELECT id FROM credit_transactions WHERE reference=?1 LIMIT 1').bind(`payment:${reference}`).first();if(existing)return{processed:false,idempotent:true,credit_transaction_id:existing.id};const product=await env.DB.prepare('SELECT credits FROM credit_packages WHERE id=?1 AND enabled=1 LIMIT 1').bind(productId).first();if(!product)throw new Error('Credit product not found.');const result=await billingAddCredits(env,{userId,amount:Number(product.credits),type:'purchase',description:`Credit purchase: ${productId}`,reference:`payment:${reference}`,paymentId:payment.id});return{processed:result.applied,idempotent:!result.applied};}const plan=await env.DB.prepare('SELECT id,price_minor,currency FROM plans WHERE id=?1 AND enabled=1 LIMIT 1').bind(productId).first();if(!plan)throw new Error('Subscription plan not found.');if(Number(plan.price_minor)!==Number(amountMinor)||String(plan.currency).toUpperCase()!==String(currency).toUpperCase())throw new Error('Subscription plan price mismatch.');return{processed:true,subscription_pending:true};}
export{billingCurrentUser,billingEnsureAccount,billingCatalog,billingAccount,billingCreateCheckout,billingPaymentStatus,billingFinalizePayment};
