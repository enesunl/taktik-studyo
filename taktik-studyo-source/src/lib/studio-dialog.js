export function createStudioDialog({document,host}){
  const container=document.createElement('div');host.append(container);let finish=null;
  function ask({title,message,value,confirm='Devam et',opener}){
    finish?.(null);
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog'),heading=document.createElement('h2'),text=document.createElement('p'),form=document.createElement('form');
      dialog.className='studio-project-dialog';dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',title);heading.textContent=title;text.textContent=message||'';
      let input=null;if(value!==undefined){const label=document.createElement('label');label.textContent='Çalışma adı';input=document.createElement('input');input.value=value;input.required=true;input.maxLength=120;label.append(input);form.append(label);}
      const cancel=document.createElement('button'),submit=document.createElement('button');cancel.type='button';cancel.textContent='İptal';submit.type='submit';submit.textContent=confirm;form.append(cancel,submit);dialog.append(heading,text,form);container.replaceChildren(dialog);
      const end=result=>{dialog.close();container.replaceChildren();form.removeEventListener('submit',save);cancel.removeEventListener('click',no);dialog.removeEventListener('cancel',escape);finish=null;opener?.focus();resolve(result);};
      const save=e=>{e.preventDefault();end(input?input.value:true);},no=()=>end(null),escape=e=>{e.preventDefault();no();};finish=end;
      form.addEventListener('submit',save);cancel.addEventListener('click',no);dialog.addEventListener('cancel',escape);dialog.showModal();(input||cancel).focus();
    });
  }
  return {ask,dispose(){finish?.(null);container.replaceChildren();}};
}
