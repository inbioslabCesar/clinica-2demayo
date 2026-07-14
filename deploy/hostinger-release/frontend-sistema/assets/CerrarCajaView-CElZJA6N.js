import{r as x,j as e}from"./vendor-react-BF86aG3W.js";import{S as D}from"./vendor-alerts-BNSx6I1T.js";import{a as A,B as G}from"./examenes-laboratorio-crud-CmTbY20c.js";import{u as K}from"./vendor-pkg-react-router-nHW4BzwA.js";import"./vendor-dicom-DYOJ4YRd.js";import"./vendor-pkg-scheduler-CoSDG3-6.js";function Q(a,d=null,t=null){const S=d?.total_efectivo??a.total_efectivo??0,b=d?.total_yape??a.total_yape??0,L=d?.total_plin??a.total_plin??0,M=d?.total_tarjetas??a.total_tarjetas??0,$=d?.total_transferencias??a.total_transferencias??0,w=d?.total_contratos_abono??0,h=d?.egreso_honorarios??a.egreso_honorarios??0,m=d?.egreso_lab_ref??a.egreso_lab_ref??0,C=d?.egreso_operativo??a.egreso_operativo??0,T=a.egreso_electronico!==void 0&&a.egreso_electronico!==""&&!isNaN(parseFloat(a.egreso_electronico))?parseFloat(a.egreso_electronico):0,_=d?.total_egresos??h+m+C;let g="";(a.monto_contado!==void 0?parseFloat(a.monto_contado):0)-_<0&&(g="<div class='t-warning'>No hay efectivo suficiente; el egreso fue cubierto por Yape, Plin, transferencia o quedó pendiente.</div>");const E=String(t?.name||"MI CLINICA").trim(),O=t?.logo?`<div style="text-align:center;margin:0 0 8px 0;"><img src="${t.logo}" alt="Logo clínica" style="display:block;height:52px;max-width:160px;object-fit:contain;margin:0 auto;" /></div>`:"",q=t?.slogan?`<p style="text-align:center;margin:0 0 8px 0;font-style:italic;font-size:11px;line-height:1.25;${t.slogan_color?"color:"+t.slogan_color+";":""}">${t.slogan}</p>`:"",j="cierreCaja.printMode",I="cierreCaja.lastResolvedPrintMode",z=()=>{try{const i=window.localStorage.getItem(j);if(i==="auto"||i==="termica"||i==="a4")return i}catch{}return"auto"},y=()=>{try{const i=window.localStorage.getItem(I);if(i==="termica"||i==="a4")return i}catch{}return"termica"},u=(i,l)=>{try{window.localStorage.setItem(j,i),window.localStorage.setItem(I,l)}catch{}},o=Number(a.caja_id||0),s=[`CIERRE:${o||"-"}`,`FECHA:${a.fecha||"-"}`,`USUARIO:${a.usuario_nombre||"-"}`,`APERTURA:${(a.monto_apertura||0).toFixed(2)}`,`EFECTIVO:${S.toFixed(2)}`,`EGRESOS:${_.toFixed(2)}`].join("|"),r=`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(s)}`,c=(i="termica")=>{const l=i==="a4";return`
    ${`
    <style>
      .ticket-cierre {
        width: ${l?"720px":"320px"};
        margin: 0 auto;
        padding: ${l?"14px 18px":"8px 10px"};
        box-sizing: border-box;
        font-family: "Courier New", "Lucida Console", monospace;
        color: #1f2937;
        font-size: ${l?"14px":"11px"};
        line-height: ${l?"1.3":"1.2"};
      }
      .ticket-cierre .t-center { text-align: center; }
      .ticket-cierre .t-title {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .ticket-cierre .t-subtitle {
        margin: 0 0 10px 0;
        font-size: 13px;
        font-weight: 700;
      }
      .ticket-cierre .t-hr {
        border: 0;
        border-top: 1px dashed #6b7280;
        margin: ${l?"8px 0":"4px 0"};
      }
      .ticket-cierre .t-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin: ${l?"1px 0":"0px 0"};
      }
      .ticket-cierre .t-row .label { font-weight: 700; white-space: nowrap; }
      .ticket-cierre .t-row .value { text-align: right; }
      .ticket-cierre .t-section {
        margin: ${l?"6px 0 3px":"4px 0 2px"};
        font-weight: 700;
        text-transform: uppercase;
        font-size: ${l?"12px":"11px"};
        letter-spacing: 0.4px;
      }
      .ticket-cierre .t-note {
        margin-top: 8px;
        white-space: pre-line;
        font-size: 12px;
      }
      .ticket-cierre .t-warning {
        margin-top: 8px;
        color: #b91c1c;
        font-weight: 700;
        font-size: 12px;
      }
      .ticket-cierre .t-footer {
        margin-top: 10px;
        text-align: center;
        font-size: 11px;
        color: #4b5563;
      }
      .ticket-cierre .t-qr {
        margin-top: 10px;
        text-align: center;
      }
      .ticket-cierre .t-qr img {
        width: 92px;
        height: 92px;
        object-fit: contain;
      }
      .ticket-cierre .t-qr-caption {
        margin-top: 4px;
        font-size: 11px;
        color: #4b5563;
      }
      @media print {
        body { margin: 0; }
        @page {
          size: ${l?"A4 portrait":"auto"};
          margin: ${l?"10mm":"2mm"};
        }
        .ticket-cierre {
          width: ${l?"190mm":"76mm"};
          margin: 0;
          padding: ${l?"6mm":"2.5mm"};
          font-size: ${l?"13px":"10.5px"};
          line-height: ${l?"1.3":"1.15"};
        }
      }
    </style>
  `}
    <div class="ticket-cierre">
      ${O}
      <h3 class="t-center t-title" style="${t?.nombre_color?"color:"+t.nombre_color+";":""}">${E}</h3>
      ${q}
      <h4 class="t-center t-subtitle">CIERRE DE CAJA</h4>
      <hr class="t-hr" />

      <div class="t-row"><span class="label">Usuario</span><span class="value">${a.usuario_nombre||"-"}</span></div>
      <div class="t-row"><span class="label">Rol</span><span class="value">${a.usuario_rol||"-"}</span></div>
      <div class="t-row"><span class="label">Fecha</span><span class="value">${a.fecha||"-"}</span></div>
      <div class="t-row"><span class="label">Apertura</span><span class="value">S/ ${(a.monto_apertura||0).toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Hora apertura</span><span class="value">${a.hora_apertura||"-"}</span></div>
      <div class="t-row"><span class="label">Hora cierre</span><span class="value">${a.hora_cierre||"-"}</span></div>

      <hr class="t-hr" />
      <div class="t-section">Ingresos por tipo</div>
      <div class="t-row"><span class="label">Efectivo</span><span class="value">S/ ${S.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Yape</span><span class="value">S/ ${b.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Plin</span><span class="value">S/ ${L.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Tarjeta</span><span class="value">S/ ${M.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Transferencia</span><span class="value">S/ ${$.toFixed(2)}</span></div>
      ${w>0?`
      <hr class="t-hr" />
      <div class="t-section">Desglose contratos</div>
      <div class="t-row"><span class="label">Abonos contratos</span><span class="value">S/ ${w.toFixed(2)}</span></div>
      `:""}

      <hr class="t-hr" />
      <div class="t-section">Egresos</div>
      <div class="t-row"><span class="label">Honorarios medicos</span><span class="value">S/ ${h.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Lab. referencia</span><span class="value">S/ ${m.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Operativo</span><span class="value">S/ ${C.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Yape/Transferencias</span><span class="value">S/ ${T.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Total egresos</span><span class="value">S/ ${_.toFixed(2)}</span></div>

      <hr class="t-hr" />
      <div class="t-section">Ocurrencias</div>
      <div class="t-note">${a.observaciones||"Sin observaciones"}</div>
      ${g}
      <hr class="t-hr" />
      <div class="t-qr">
        <img src="${r}" alt="QR auditoria cierre" />
        <div class="t-qr-caption">Auditoria: CIERRE #${o||"-"}</div>
      </div>
      <div class="t-footer">Conserve este recibo para archivo</div>
    </div>
  `},n=z(),f=n==="auto"?y():n,p=c(f),J=`
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:left;font-size:13px;">
      <label for="ticket-print-mode" style="font-weight:600;display:block;margin-bottom:4px;">Modo de impresion</label>
      <select id="ticket-print-mode" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;">
        <option value="auto" ${n==="auto"?"selected":""}>Auto (usa ultimo modo)</option>
        <option value="termica" ${n==="termica"?"selected":""}>Termica 80mm</option>
        <option value="a4" ${n==="a4"?"selected":""}>A4</option>
      </select>
    </div>
  `;D.fire({title:"Cierre de Caja Procesado ✅",html:`${p}${J}`,icon:"success",confirmButtonText:"Imprimir Recibo",showCancelButton:!0,cancelButtonText:"Solo Continuar"}).then(i=>{if(i.isConfirmed){const l=D.getHtmlContainer()?.querySelector("#ticket-print-mode"),N=l?.value==="a4"||l?.value==="termica"||l?.value==="auto"?l.value:n,H=N==="auto"?y():N;u(N,H);const Y=c(H),v=window.open("","_blank");v.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cierre de Caja</title></head><body>${Y}</body></html>`),v.document.close(),setTimeout(()=>{const k=v.document.querySelectorAll("img");if(k.length>0){let R=0;const U=()=>{R++,R===k.length&&v.print()};k.forEach(P=>{P.complete?R++:(P.onload=U,P.onerror=U)}),R===k.length&&v.print()}else v.print()},300)}})}function te(){const[a,d]=x.useState(""),[t,S]=x.useState(null),[b,L]=x.useState(""),[M,$]=x.useState(!0),[w,h]=x.useState(""),[m,C]=x.useState(""),[T,_]=x.useState({name:"MI CLINICA",logo:"",slogan:"",slogan_color:"",nombre_color:""}),g=K(),F=async({mostrarMensaje:o=!1}={})=>{try{const r=await(await A("api_caja_estado.php",{cache:"no-store"})).json(),c=!!r?.success&&String(r?.estado||"").toLowerCase()==="abierta";return!c&&o&&await D.fire({icon:"info",title:"Caja ya cerrada",text:"No puedes acceder a cierre de caja porque la caja actual ya esta cerrada.",confirmButtonText:"Entendido"}),c}catch{return!1}};x.useEffect(()=>{async function o(){$(!0);try{if(!await F()){h("No hay caja abierta para cerrar"),g("/contabilidad",{replace:!0});return}const c=await(await A("api_resumen_diario.php")).json();c.success?(S(c),h("")):h(c.error||"Error al cargar resumen")}catch{h("Error de conexión")}finally{$(!1)}}o()},[g]),x.useEffect(()=>{const o=async()=>{await F()||g("/contabilidad",{replace:!0})};return window.addEventListener("pageshow",o),()=>window.removeEventListener("pageshow",o)},[g]),x.useEffect(()=>{let o=!0;return A("api_get_configuracion.php",{method:"GET",cache:"no-store"}).then(s=>s.json()).then(s=>{if(!o||!s?.success)return;const r=s.data||{},c=String(r.nombre_clinica||"").trim().toUpperCase()||"MI CLINICA",n=String(r.logo_url||"").trim(),f=n?/^(https?:\/\/|data:|blob:)/i.test(n)?n:`${G}${n.replace(/^\/+/,"")}`:"";_({name:c,logo:f,slogan:String(r.slogan||"").trim(),slogan_color:String(r.slogan_color||"").trim(),nombre_color:String(r.nombre_color||"").trim()})}).catch(()=>{}),()=>{o=!1}},[]);const E=t?.por_pago?t.por_pago.reduce((o,s)=>o+parseFloat(s.total_pago||0),0):0,O=t?E-(parseFloat(t.egreso_honorarios||0)+parseFloat(t.egreso_lab_ref||0)+parseFloat(t.egreso_operativo||0)):0,q=async()=>{let o=0,s=0,r=0,c=0;t?.por_pago?.length&&t.por_pago.forEach(n=>{const f=(n.metodo_pago||n.tipo_pago||"").toLowerCase();f==="yape"&&(o=parseFloat(n.total_pago)),f==="plin"&&(s=parseFloat(n.total_pago)),f==="tarjeta"&&(r=parseFloat(n.total_pago)),f==="transferencia"&&(c=parseFloat(n.total_pago))});try{if(!await F({mostrarMensaje:!0})){g("/contabilidad",{replace:!0});return}const p=await(await A("api_cerrar_caja.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({monto_contado:b,observaciones:a,total_yape:o,total_plin:s,total_tarjetas:r,total_transferencias:c,egreso_electronico:m})})).json();p.success?(Q({...t,observaciones:a,monto_contado:b,caja_id:p.caja_id,fecha:p.fecha||t?.fecha||new Date().toISOString().slice(0,10),egreso_electronico:m,hora_cierre:p.hora_cierre||new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit",hour12:!0}),usuario_nombre:p.usuario_nombre||(window.sessionStorage.getItem("usuario")?JSON.parse(window.sessionStorage.getItem("usuario")).nombre:""),usuario_rol:p.usuario_rol||(window.sessionStorage.getItem("usuario")?JSON.parse(window.sessionStorage.getItem("usuario")).rol:"")},p.totales,T),setTimeout(()=>g("/contabilidad"),500)):alert("Error: "+(p.error||"No se pudo cerrar la caja"))}catch{alert("Error de conexión al cerrar caja")}};if(M)return e.jsx("div",{className:"p-8 text-center",children:"Cargando resumen..."});if(w)return e.jsx("div",{className:"p-8 text-center text-red-600",children:w});if(!t)return null;const j=(()=>{const o=t?.por_pago?.find(s=>(s.metodo_pago||s.tipo_pago)?.toLowerCase()==="efectivo");return o?parseFloat(o.total_pago):0})(),I=m!==""&&!isNaN(parseFloat(m))?parseFloat(m):0,z=(t.egreso_honorarios?t.egreso_honorarios:0)+(t.egreso_lab_ref?t.egreso_lab_ref:0)+(t.egreso_operativo?t.egreso_operativo:0),y=j-(z-I),u=parseFloat(b||0)-y;return e.jsx(e.Fragment,{children:e.jsxs("div",{className:"max-w-3xl mx-auto p-4 sm:p-8 bg-gradient-to-br from-red-50 via-white to-red-100 rounded-2xl shadow-2xl",children:[e.jsxs("h2",{className:"text-3xl font-extrabold mb-6 text-red-700 flex items-center gap-3 drop-shadow",children:[e.jsx("span",{className:"inline-block bg-red-100 text-red-700 rounded-full p-2 text-3xl",children:"🧾"}),"Cierre de Caja"]}),e.jsxs("div",{className:"flex flex-wrap gap-4 mb-6 justify-center",children:[e.jsxs("div",{className:"bg-orange-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto",children:[e.jsx("span",{className:"text-xs text-orange-700 font-semibold",children:"Fecha"}),e.jsx("span",{className:"font-bold text-orange-800 text-lg tracking-wide",children:t.fecha})]}),e.jsxs("div",{className:"bg-blue-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto",children:[e.jsx("span",{className:"text-xs text-blue-700 font-semibold",children:"Apertura"}),e.jsxs("span",{className:"font-bold text-blue-800 text-lg tracking-wide",children:["S/ ",t.monto_apertura?.toFixed(2)]})]}),e.jsxs("div",{className:"bg-yellow-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto",children:[e.jsx("span",{className:"text-xs text-yellow-700 font-semibold",children:"Ingreso total del día"}),e.jsxs("span",{className:"font-bold text-yellow-800 text-lg tracking-wide",children:["S/ ",E.toFixed(2)]})]}),e.jsxs("div",{className:"bg-green-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto",children:[e.jsx("span",{className:"text-xs text-green-700 font-semibold",children:"Ganancia del día"}),e.jsxs("span",{className:"font-bold text-green-800 text-lg tracking-wide",children:["S/ ",O.toFixed(2)]}),e.jsx("span",{className:"text-xs text-gray-600 mt-1",children:"(Ingreso total - egresos)"})]})]}),e.jsxs("div",{className:"mb-6",children:[e.jsx("span",{className:"font-semibold text-gray-700 mb-2 block text-lg",children:"Cobros por tipo de pago:"}),e.jsx("div",{className:"flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-blue-50 snap-x snap-mandatory",children:t.por_pago?.map((o,s)=>{let r="green";return(o.metodo_pago||o.tipo_pago).toLowerCase().includes("tarjeta")?r="blue":(o.metodo_pago||o.tipo_pago).toLowerCase().includes("yape")||(o.metodo_pago||o.tipo_pago).toLowerCase().includes("plin")||(o.metodo_pago||o.tipo_pago).toLowerCase().includes("transfer")?r="purple":(o.metodo_pago||o.tipo_pago).toLowerCase().includes("efectivo")&&(r="yellow"),e.jsxs("div",{className:`rounded-xl shadow-lg bg-white border-t-4 border-${r}-400 px-4 py-3 flex flex-col items-center gap-1 w-full sm:w-[140px] snap-center transition-all hover:scale-105`,children:[e.jsx("span",{className:`font-bold text-${r}-700 text-sm truncate`,children:(o.metodo_pago||o.tipo_pago).toUpperCase()}),e.jsxs("span",{className:`text-base text-${r}-600 font-mono`,children:["S/ ",parseFloat(o.total_pago).toFixed(2)]})]},s)})}),(()=>{const o=parseFloat(t?.total_contratos_abono||0);return o<=0?null:e.jsx("div",{className:"mt-3 flex gap-3",children:e.jsxs("div",{className:"rounded-xl shadow-lg bg-white border-t-4 border-teal-400 px-4 py-3 flex flex-col items-center gap-1 w-full sm:w-[160px] transition-all hover:scale-105",children:[e.jsx("span",{className:"font-bold text-teal-700 text-sm truncate",children:"CONTRATO ABONO"}),e.jsxs("span",{className:"text-base text-teal-600 font-mono",children:["S/ ",o.toFixed(2)]}),e.jsx("span",{className:"text-xs text-gray-500",children:"incluido en totales"})]})})})()]}),e.jsxs("div",{className:"flex flex-col gap-4 mb-6",children:[e.jsxs("div",{className:"bg-yellow-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg",children:[e.jsx("span",{className:"text-xs text-yellow-700 font-semibold",children:"Efectivo cobrado"}),e.jsxs("span",{className:"font-bold text-yellow-800 text-2xl",children:["S/ ",j.toFixed(2)]})]}),e.jsxs("div",{className:"flex gap-4 flex-wrap justify-center my-2",children:[e.jsxs("div",{className:"bg-orange-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]",children:[e.jsx("span",{className:"text-xs text-orange-700 font-semibold flex items-center gap-1",children:"🩺 Honorarios Médicos"}),e.jsxs("span",{className:"font-bold text-orange-800 text-lg",children:["- S/ ",t.egreso_honorarios?t.egreso_honorarios.toFixed(2):"0.00"]})]}),e.jsxs("div",{className:"bg-pink-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]",children:[e.jsx("span",{className:"text-xs text-pink-700 font-semibold flex items-center gap-1",children:"🧑‍🔬 Honorarios Lab. Ref."}),e.jsxs("span",{className:"font-bold text-pink-800 text-lg",children:["- S/ ",t.egreso_lab_ref?t.egreso_lab_ref.toFixed(2):"0.00"]})]}),e.jsxs("div",{className:"bg-indigo-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]",children:[e.jsx("span",{className:"text-xs text-indigo-700 font-semibold flex items-center gap-1",children:"🛠️ Egreso Operativo"}),e.jsxs("span",{className:"font-bold text-indigo-800 text-lg",children:["- S/ ",t.egreso_operativo?t.egreso_operativo.toFixed(2):"0.00"]})]})]}),e.jsx("div",{className:"flex gap-2 flex-wrap justify-center my-2",children:e.jsxs("div",{className:"bg-gray-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg min-w-[160px]",children:[e.jsx("span",{className:"text-xs text-gray-700 font-semibold",children:"Total egresos"}),e.jsxs("span",{className:"font-bold text-gray-800 text-lg",children:["- S/ ",((t.egreso_honorarios?t.egreso_honorarios:0)+(t.egreso_lab_ref?t.egreso_lab_ref:0)+(t.egreso_operativo?t.egreso_operativo:0)).toFixed(2)]})]})}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-4 mt-2",children:[e.jsxs("div",{className:"flex-1 bg-yellow-200 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg",children:[e.jsx("span",{className:"text-xs text-yellow-700 font-semibold",children:"Efectivo esperado"}),e.jsxs("span",{className:"font-bold text-yellow-800 text-3xl",children:["S/ ",y.toFixed(2)]}),e.jsx("span",{className:"text-xs text-gray-700 mt-1",children:"(Efectivo cobrado - total egresos + egreso electrónico)"})]}),e.jsxs("div",{className:"flex-1 bg-purple-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg",children:[e.jsx("span",{className:"text-xs text-purple-700 font-semibold",children:"Egresos cubiertos por Yape/Transferencias"}),e.jsx("input",{type:"number",value:m,onChange:o=>C(o.target.value),className:"border-2 border-purple-300 rounded-xl px-4 py-2 mt-2 text-xl text-center font-bold w-full max-w-[160px] focus:ring-2 focus:ring-purple-400 bg-white",placeholder:"S/ 0.00",min:0,step:.01}),e.jsx("span",{className:"text-xs text-gray-700 mt-1",children:"(Descontado del total egreso)"})]}),e.jsxs("div",{className:"flex-1 bg-green-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg",children:[e.jsx("span",{className:"text-xs text-green-700 font-semibold",children:"Efectivo contado"}),e.jsx("input",{type:"number",value:b,onChange:o=>L(o.target.value),className:"border-2 border-green-300 rounded-xl px-4 py-2 mt-2 text-xl text-center font-bold w-full max-w-[160px] focus:ring-2 focus:ring-green-400 bg-white",placeholder:"S/ 0.00"})]}),e.jsxs("div",{className:`flex-1 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg ${u===0?"bg-green-200":u>0?"bg-blue-100":"bg-red-100"}`,children:[e.jsx("span",{className:"text-xs font-semibold mb-1",children:"Diferencia"}),e.jsxs("span",{className:`font-bold text-3xl ${u===0?"text-green-700":u>0?"text-blue-700":"text-red-700"}`,children:["S/ ",u.toFixed(2)]}),u===0?e.jsx("span",{className:"text-green-700 text-xs font-semibold mt-1",children:"¡Cuadre perfecto!"}):u>0?e.jsx("span",{className:"text-blue-700 text-xs font-semibold mt-1",children:"Sobra efectivo"}):e.jsx("span",{className:"text-red-700 text-xs font-semibold mt-1",children:"Falta efectivo"})]})]})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("label",{className:"block text-base font-semibold text-gray-700 mb-2",htmlFor:"observaciones",children:"Ocurrencias / Observaciones"}),e.jsx("textarea",{id:"observaciones",value:a,onChange:o=>d(o.target.value),className:"w-full border-2 border-red-300 rounded-xl px-4 py-3 min-h-[70px] resize-y focus:ring-2 focus:ring-red-400 bg-white text-base",placeholder:"Escribe aquí cualquier ocurrencia, incidente o comentario relevante antes del cierre..."})]}),e.jsx("button",{className:"bg-gradient-to-r from-red-500 to-red-700 text-white px-10 py-4 rounded-2xl shadow-xl font-extrabold text-xl w-full mt-2 transition-all hover:scale-105 hover:from-red-600 hover:to-red-800",onClick:q,children:"Confirmar cierre de caja"})]})})}export{te as default};
