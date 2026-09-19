// Resolve the decision before mounting: restored board must see the imported data.
export async function chooseLegacyDrafts({scope, slots, container, document}) {
  const inspected = scope.inspectLegacy();
  if (!inspected.ok) return;
  for (const slot of slots) {
    if (!scope.isActive()) return;
    const entry = inspected.slots.find(item => item.slot === slot);
    if (!entry?.legacyValid || entry.targetExists) continue;
    await new Promise(resolve => {
      const box = document.createElement('section'); box.className = 'legacy-prompt';
      const message = document.createElement('p'); message.setAttribute('role','status');
      const label = {main:'stüdyo',left:'sol karşılaştırma',right:'sağ karşılaştırma'}[slot];
      message.textContent = 'Bu cihazda eski bir ' + label + ' taslağı bulundu.';
      const accept = document.createElement('button'), decline = document.createElement('button');
      accept.type = decline.type = 'button'; accept.textContent = 'İçe aktar'; decline.textContent = 'Yeni taslakla devam et';
      box.append(message,accept,decline); container.append(box);
      let done = false, off = () => {};
      function finish() {if (done) return; done = true; off(); box.remove(); resolve();}
      accept.addEventListener('click',() => {
        if (done || !scope.isActive()) return;
        const result = scope.importLegacy(slot,{confirmed:true});
        if (result.ok) finish();
        else {message.textContent = 'Taslak içe aktarılamadı. Yeni taslakla devam edebilirsin.'; accept.disabled = true;}
      });
      decline.addEventListener('click',finish);
      off = scope.context(slot)?.onDispose(finish) || (() => {});
    });
  }
}
