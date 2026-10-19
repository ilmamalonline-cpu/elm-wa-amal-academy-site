'use strict';
const $ = id => document.getElementById(id);
let context, selected, data, busy = false;
const intents = new Map();
const errors = {
  fixture_persona_forbidden: 'هذه العملية ليست متاحة لهوية هذه الواجهة الصناعية.',
  payment_unavailable_or_forbidden: 'الطلب غير متاح لهذه الهوية أو لا توجد صلاحية.',
  payment_transition_not_allowed: 'الانتقال غير مسموح: راجع القبول والمبلغ والعملة والطريقة وحالة المحاولة.',
  payment_conflict: 'تعارض أو مرجع مكرر؛ لا تعِد التفعيل. راجع الحالة أولًا.',
  invalid_payment_request: 'البيانات غير صحيحة. استخدم قيمًا ومراجع صناعية فقط.',
};
async function api(path, body) {
  const response = await fetch('/api/manual-payments/' + path, { method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(errors[value.error] || 'تعذّر تنفيذ العملية محليًا. راجع الحالة قبل إعادة المحاولة.');
  return value;
}
function stableId(action, payload) {
  const key = JSON.stringify([action === 'create' ? null : selected, action, payload]);
  if (!intents.has(key)) intents.set(key, crypto.randomUUID());
  return intents.get(key);
}
function latestQuote() { return data?.quotes.at(-1); }
function latestAttempt() { return data?.attempts.at(-1); }
function amount(id) {
  const value = Number($(id).value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) throw new Error('أدخل مبلغًا صحيحًا موجبًا بأصغر وحدة للعملة.');
  return value;
}
function renderControls() {
  const q = latestQuote(), a = latestAttempt(), active = Boolean(data?.activation), pending = a?.status === 'pending';
  $('create-order').disabled = busy;
  $('refresh').disabled = busy;
  $('offer-quote').disabled = busy || !data || active || pending;
  $('accept-quote').disabled = busy || !q || Boolean(q.accepted_at) || active || !$('accept-check').checked;
  $('submit-attempt').disabled = busy || !q?.accepted_at || pending || active || !/^SYNTHETIC-[A-Z0-9-]{1,80}$/.test($('reference').value);
  $('approve').disabled = busy || !pending || !$('approve-check').checked || !$('capacity-check').checked || !$('reason').value.trim() || !$('actual-minor').value || !/^SYNTHETIC-[A-Z0-9-]{1,80}$/.test($('verification-source').value);
  $('reject').disabled = busy || !pending || !$('reason').value.trim();
}
function render() {
  $('details').hidden = !data;
  if (!data) { renderControls(); return; }
  const q = latestQuote(), a = latestAttempt();
  $('order-id').textContent = 'معرّف صناعي: ' + data.order.id;
  $('snapshot').textContent = `الباقة ${data.order.package_id} — السعر الأصلي ${Number(data.order.advertised_minor) / 100} ${data.order.advertised_currency} — ${data.order.lessons} حصص — ${data.order.duration_minutes} دقيقة${data.order.duration_is_maximum ? ' كحد أقصى' : ''} — الشروط ${data.order.policy_version} — المحتوى: ${data.order.features.join('، ')}`;
  $('quote').textContent = q ? `${Number(q.amount_minor) / 100} ${q.currency} — ${q.method} — إصدار ${q.revision} — ${q.accepted_at ? 'مقبول صراحة' : 'بانتظار قبول الأسرة'} — ${q.id}` : 'لا يوجد عرض مالي بعد. لا تقدم أي مرجع قبل عرض وقبول صريحين.';
  $('status').textContent = a ? ({ pending: 'مرجع مقدم — بانتظار المراجعة، غير مفعّل', rejected: 'مرفوض — ' + a.rejection_reason, verified: 'اعتمد المراجع المحاولة الصناعية' }[a.status] || a.status) : 'لم يُقدّم مرجع بعد';
  $('activation').textContent = data.activation ? `مفعّل صناعيًا فقط — ${data.activation.lesson_entitlement} حصص — من ${data.activation.starts_at} إلى ${data.activation.ends_at} — ${data.activation.id}` : 'غير مفعّل — تقديم المرجع وحده لا يفعّل الدورة';
  $('history').textContent = JSON.stringify({ quotes: data.quotes, attempts: data.attempts }, null, 2);
  renderControls();
}
async function load() {
  const result = await api('orders');
  $('orders').replaceChildren();
  for (const item of result.data) {
    const li = document.createElement('li'), button = document.createElement('button');
    button.dataset.orderId = item.order.id;
    button.textContent = 'طلب صناعي ' + item.order.id;
    button.onclick = () => run(async () => { selected = item.order.id; resetConfirmations(); data = (await api('orders/' + selected)).data; render(); });
    li.append(button); $('orders').append(li);
  }
  if (selected) { data = (await api('orders/' + selected)).data; render(); }
}
function resetConfirmations() { for (const id of ['accept-check', 'capacity-check', 'approve-check']) $(id).checked = false; }
async function run(operation) {
  if (busy) return;
  busy = true; $('error').textContent = ''; $('notice').textContent = ''; renderControls();
  try { await operation(); }
  catch (error) { $('error').textContent = error.message; }
  finally { busy = false; renderControls(); }
}
async function command(action, payload, idRequired = false) {
  const body = idRequired ? { id: stableId(action, payload), ...payload } : payload;
  const value = await api('orders/' + selected + '/' + action, body);
  resetConfirmations(); await load(); $('notice').textContent = 'سُجّلت العملية الصناعية: ' + value.id;
}
$('refresh').onclick = () => run(async () => { resetConfirmations(); await load(); });
$('create-order').onclick = () => run(async () => {
  const body = { id: stableId('create', {}), studentId: context.studentId, packageId: 'quran' };
  const result = await api('orders', body); selected = result.id; resetConfirmations(); await load();
});
$('offer-quote').onclick = () => run(async () => {
  if ($('method').value === 'synthetic-egyptian-wallet' && $('currency').value !== 'EGP') throw new Error('طريقة المحفظة الصناعية تقبل EGP فقط؛ لا يوجد تحويل من SAR.');
  await command('quotes', { amountMinor: amount('amount-minor'), currency: $('currency').value, method: $('method').value }, true);
});
$('accept-quote').onclick = () => run(async () => {
  if (!$('accept-check').checked) throw new Error('القبول الصريح مطلوب.');
  const q = latestQuote();
  await command('acceptance', { quoteId: q.id, amountMinor: Number(q.amount_minor), currency: q.currency, method: q.method, policyVersion: 'manual-payment-local-v1' });
});
$('submit-attempt').onclick = () => run(async () => {
  const q = latestQuote(), a = latestAttempt();
  await command('attempts', { quoteId: q.id, amountMinor: Number(q.amount_minor), currency: q.currency, reference: $('reference').value, previousAttemptId: a?.status === 'rejected' ? a.id : null }, true);
});
async function review(decision) {
  if (decision === 'verified' && (!$('approve-check').checked || !$('capacity-check').checked)) throw new Error('الموافقة الصريحة وتأكيد القدرة مطلوبان.');
  await command('review', { attemptId: latestAttempt().id, decision, reason: $('reason').value.trim(), actualMinor: decision === 'verified' ? amount('actual-minor') : null, actualCurrency: decision === 'verified' ? $('actual-currency').value : null, verificationSource: decision === 'verified' ? $('verification-source').value : null, capacityConfirmed: decision === 'verified' && $('capacity-check').checked });
}
$('approve').onclick = () => run(() => review('verified'));
$('reject').onclick = () => run(() => review('rejected'));
for (const id of ['accept-check', 'capacity-check', 'approve-check', 'reason', 'reference', 'verification-source', 'actual-minor']) $(id).addEventListener('input', renderControls);
void run(async () => {
  const response = await fetch('/api/context', { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error('التجربة المحلية غير متاحة.');
  context = await response.json();
  if (context.mode !== 'synthetic-only' || !['family', 'reviewer'].includes(context.persona)) throw new Error('هوية التجربة غير صالحة.');
  $('identity').textContent = context.persona === 'family' ? 'واجهة الأسرة — ولي صناعي ثابت، لا حساب طفل مستقل' : 'واجهة المراجع — هوية صناعية بصلاحية محفوظة على الخادم، وليست حساب المالك الحقيقي';
  $(context.persona).hidden = false; $('create-order').hidden = context.persona !== 'family';
  await load();
});
