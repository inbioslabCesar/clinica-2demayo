import{j as e,r as u}from"./vendor-react-BF86aG3W.js";import{a as R,B as st}from"./examenes-laboratorio-crud-CmTbY20c.js";import{S as j}from"./vendor-alerts-BNSx6I1T.js";function nt({tipoDescuento:d,setTipoDescuento:a,valorDescuento:A,setValorDescuento:W,montoOriginal:_,errorDescuento:S,montoFinalOverride:X,montoDescuentoOverride:g}){const $=Number.isFinite(Number(_))?Number(_):0,E=Number.isFinite(Number(A))?Number(A):0,z=d==="porcentaje"?$*(E/100):E,Q=Number.isFinite(Number(g))?Math.max(0,Number(g)):Math.max(0,z),B=Number.isFinite(Number(X))?Math.max(0,Number(X)):Math.max($-Q,0),H=w=>{const L=String(w??"").replace(",",".").trim(),U=Number.parseFloat(L);return Number.isFinite(U)?U:0};return e.jsxs("div",{className:"mb-6",children:[e.jsx("label",{className:"block font-semibold mb-2",children:"Descuento:"}),e.jsxs("div",{className:"mb-2 flex flex-col gap-2",children:[e.jsxs("select",{value:d,onChange:w=>a(w.target.value),className:"border rounded px-3 py-2 w-full",children:[e.jsx("option",{value:"porcentaje",children:"Porcentaje (%)"}),e.jsx("option",{value:"monto",children:"Monto fijo (S/)"})]}),e.jsx("input",{type:"number",min:"0",step:"any",value:A,onChange:w=>W(H(w.target.value)),className:"border rounded px-3 py-2 w-full",placeholder:d==="porcentaje"?"Ej: 10":"Ej: 20.00"})]}),e.jsxs("div",{className:"text-sm text-gray-600",children:["Monto original: ",e.jsxs("span",{className:"font-bold",children:["S/ ",$.toFixed(2)]})]}),e.jsxs("div",{className:"text-sm text-gray-600",children:["Descuento aplicado: ",e.jsx("span",{className:"font-bold",children:d==="porcentaje"?`${E}%`:`S/ ${Q.toFixed(2)}`})]}),e.jsxs("div",{className:"text-sm text-green-700 font-bold",children:["Monto final a cobrar: S/ ",B.toFixed(2)]}),S&&e.jsx("div",{className:"text-red-600 text-sm mt-1",children:S})]})}function ct(d){const a=String(d||"").trim().toLowerCase();return a?a==="admin"||a==="administrador"?"Admin":a.includes("recep")?"Recepcion":a.includes("caja")||a.includes("cajero")?"Caja":a.includes("medico")?"Medico":a.charAt(0).toUpperCase()+a.slice(1):""}function bt({paciente:d,servicio:a,onCobroCompleto:A,onCancelar:W,detalles:_,detallesSeleccionados:S,total:X,modoCobro:g,onModoCobroChange:$,montoAbonoInput:E,saldoPendiente:z,montoObjetivoCobro:Q,onMontoAbonoChange:B,onSetCobrarTodo:H,onSetCobrarMitad:w}){const[L,U]=u.useState(""),[M,ke]=u.useState("porcentaje"),[v,Ce]=u.useState(0),[Ae,ce]=u.useState(""),[ze,Z]=u.useState(null),[Me,le]=u.useState(!0);u.useEffect(()=>{const o=JSON.parse(sessionStorage.getItem("usuario")||"{}");R("api_caja_actual.php").then(t=>t.json()).then(t=>{const s=Number(o?.id||0),n=Number(t?.caja?.usuario_id||0);t.success&&t.caja&&s>0&&n===s?Z(t.caja):Z(null),le(!1)}).catch(()=>{Z(null),le(!1)})},[]);const Fe=a&&["consulta","laboratorio","farmacia","rayosx","ecografia","procedimiento","operacion","hospitalizacion","mixto"].includes(a.key),[de,Pe]=u.useState("particular"),[V,Ee]=u.useState("efectivo"),[Le]=u.useState(""),[ue,J]=u.useState(!1),[m,Ie]=u.useState({name:"MI CLINICA",logo:"",slogan:"",slogan_color:"",nombre_color:"",direccion:"",telefono:"",celular:"",ruc:"",email:""}),De=String(d?.nombre||d?.nombres||"").trim(),Oe=String(d?.apellido||d?.apellidos||"").trim(),q=`${De} ${Oe}`.trim(),ee=String(d?.dni||"").trim(),me=String(d?.historia_clinica||"").trim();u.useEffect(()=>{_||Te()},[_]),u.useEffect(()=>{let o=!0;return(async()=>{try{const n=await(await R("api_get_configuracion.php",{method:"GET",cache:"no-store"})).json();if(!o||!n?.success)return;const r=n.data||{},p=String(r.nombre_clinica||"").trim().toUpperCase()||"MI CLINICA",x=String(r.logo_url||"").trim(),f=x?/^(https?:\/\/|data:|blob:)/i.test(x)?x:`${String(st||"").replace(/\/+$/,"")}/${x.replace(/^\/+/,"")}`:"";Ie({name:p,logo:f,slogan:String(r.slogan||"").trim(),slogan_color:String(r.slogan_color||"").trim(),nombre_color:String(r.nombre_color||"").trim(),direccion:String(r.direccion||"").trim(),telefono:String(r.telefono||"").trim(),celular:String(r.celular||"").trim(),ruc:String(r.ruc||"").trim(),email:String(r.email||"").trim()})}catch{}})(),()=>{o=!1}},[]);const Te=async()=>{try{await(await R("api_tarifas.php")).json()}catch{}},h=u.useMemo(()=>Array.isArray(_)&&_.length>0?_:[],[_]),te=(o,t)=>String(o?.cotizacion_detalle_id||o?.detalle_id||`${o?.cotizacion_id||0}-${o?.servicio_id||0}-${t}`),pe=u.useMemo(()=>{const o=new Map;return h.forEach((t,s)=>{const n=te(t,s);o.set(n,Number(t?.subtotal||0))}),o},[h]),Re=u.useMemo(()=>{const o=Array.isArray(S)&&S.length>0?S:h;return g!=="parcial"?o.map((t,s)=>({...t,subtotal_mostrar:Number(t?.subtotal||0)})):o.map((t,s)=>{const n=te(t,s),r=Number(pe.get(n)||0);return{...t,subtotal_mostrar:r,subtotal_original:Number(t?.subtotal||0)}})},[S,h,g,pe]),Be=h.reduce((o,t)=>o+(t.subtotal||0),0);let I=0;M==="porcentaje"?I=Be*(v/100):I=v;const He=()=>{const o=h.reduce((s,n)=>s+(n.subtotal||0),0);let t=0;return M==="porcentaje"?t=o*(v/100):t=v,Math.max(o-t,0)},Ue=async()=>{if(Me){j.fire("Espere","Verificando caja abierta...","info");return}if(!ze){j.fire("Error","No tienes una caja abierta. Abre tu caja antes de cobrar.","error");return}if(h.length===0){j.fire("Error","No hay servicios para cobrar","error");return}if(!d||!q){j.fire("Error","Falta identificar al paciente o particular para el cobro.","error");return}const o=h.reduce((s,n)=>s+(n.subtotal||0),0);let t=0;if(M==="porcentaje"?t=o*(v/100):t=v,t>0&&!String(L||"").trim()){j.fire("Motivo requerido","Debes ingresar el motivo del descuento para continuar.","warning");return}J(!0);try{const s=JSON.parse(sessionStorage.getItem("usuario")||"{}"),n=h.reduce((b,N)=>b+(N.subtotal||0),0);let r=0;if(M==="porcentaje"?r=n*(v/100):r=v,r<0||r>n){ce("El descuento no puede ser mayor al monto original ni negativo."),J(!1);return}else ce("");const p={paciente_id:d.id||null,usuario_id:s.id,usuario_nombre:s.nombre||"",paciente_nombre:q,paciente_dni:ee,referencia_origen:String(a?.referencia_origen||d?.referencia_origen||"").trim(),total:Math.max(n-r,0),monto_original:n,monto_descuento:r,tipo_descuento:M,valor_descuento:v,tipo_pago:V,observaciones:Le,detalles:h,servicio:String(a.key),servicio_info:{key:String(a.key),label:a.label,cotizacion_ids:a?.cotizacion_ids||[]},cotizacion_id:Number(a?.cotizacion_id||0)||null,cotizacion_ids:Array.isArray(a?.cotizacion_ids)?a.cotizacion_ids:[],motivo:r>0?L:""},x=await R("api_cobros.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});let f;try{f=await x.json()}catch{const b=await x.text();j.fire("Error","Respuesta inesperada del servidor: "+b,"error"),J(!1);return}if(!f.success&&f.error){j.fire({icon:"error",title:"Error en el cobro",text:f.error});return}f.success?(await Ve(f.cobro_id,p),A&&A(f.cobro_id,a,{monto_original:Number(n||0),monto_descuento:Number(r||0),total_cobrado:Number(p.total||0)})):j.fire("Error",f.error||"Error al procesar el cobro","error")}catch{j.fire("Error","Error de conexión con el servidor","error")}finally{J(!1)}},Ve=async(o,t)=>{const s=JSON.parse(sessionStorage.getItem("usuario")||"{}"),n=new Date().toLocaleString("es-PE"),r=q,p=t.servicio_info||{},x=Array.isArray(t.detalles)?t.detalles.find(i=>String(i.servicio_tipo||"").toLowerCase()==="consulta")||t.detalles[0]:null,f=Number(p.consulta_id||a?.consulta_id||x?.consulta_id||0);let b=null;if(f>0)try{const l=await(await R(`api_consultas.php?consulta_id=${f}`)).json();l?.success&&Array.isArray(l.consultas)&&l.consultas.length>0&&(b=l.consultas[0]||null)}catch{b=null}const N=String(b?.tipo_consulta||p.tipo_consulta||x?.tipo_consulta||"").toLowerCase(),Je=N==="programada"?"Programada":N==="espontanea"?"Espontanea":N?N.charAt(0).toUpperCase()+N.slice(1):"No especificada";let oe=String(b?.hora||p.hora||x?.hora||"").slice(0,5),D=String(b?.fecha||p.fecha||x?.fecha||"").slice(0,10);!oe&&Array.isArray(t.detalles)&&t.detalles.length>0&&(oe=t.detalles[0].hora||""),!D&&Array.isArray(t.detalles)&&t.detalles.length>0&&(D=t.detalles[0].fecha||"");const qe=/^\d{4}-\d{2}-\d{2}$/.test(D)?(()=>{const[i,l,c]=D.split("-");return`${c}/${l}/${i}`})():D,Ge=N==="programada"?p.numero_orden||b?.numero_orden||"N/A":"",Ye=m.logo||"/2demayo.svg",k=Array.from(new Set([...Array.isArray(t?.cotizacion_ids)?t.cotizacion_ids:[],...Array.isArray(a?.cotizacion_ids)?a.cotizacion_ids:[],Number(a?.cotizacion_id||0)].map(i=>Number(i)).filter(i=>Number.isFinite(i)&&i>0)));k[0];const be=String(t?.referencia_origen||a?.referencia_origen||d?.referencia_origen||"").trim(),ge=String(t?.usuario_nombre||s?.nombre||s?.usuario||"Sistema").trim()||"Sistema",xe=ct(t?.usuario_rol||s?.rol||""),Ke=xe?`${ge} (${xe})`:ge,ie=Number.isFinite(Number(z))&&Number(z)>0,fe=k.length>0&&ie,he=Math.max(0,Number(z||0)),ve=Math.max(0,Number(t?.total||0)),ae=Math.max(0,Number(t?.monto_descuento||0)),ye=Math.max(0,he-ve-ae),je=ie&&(g==="parcial"||ye>0),We=ie&&(fe||je),Y=p.key==="consulta";let y="",F=String(b?.medico_abreviatura_profesional||p.medico_abreviatura_profesional||x?.medico_abreviatura_profesional||"").trim();if(b){const i=String(b.medico_nombre_completo||`${b.medico_nombre||""} ${b.medico_apellido||""}`).trim();i&&(y=i)}if(Array.isArray(t.detalles))for(const i of t.detalles){F||(F=String(i.medico_abreviatura_profesional||"").trim());const l=String(i.medico_nombre_completo||`${i.medico_nombre||""} ${i.medico_apellido||""}`).trim();if(l){y=l;break}if(i.medico_nombre){y=i.medico_nombre;break}if(i.medico){y=i.medico;break}}!y&&t.servicio_info&&t.servicio_info.medico_nombre&&(y=t.servicio_info.medico_nombre),F||(F="Dr(a).");const _e=y?y.toLowerCase().startsWith(F.toLowerCase())?y:`${F} ${y}`:"",C=i=>`S/ ${Number(i||0).toFixed(2)}`,P=i=>String(i??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"),Ne=[m.telefono?`Tel: ${P(m.telefono)}`:"",m.celular?`Cel: ${P(m.celular)}`:""].filter(Boolean).join(" | "),$e={consulta:"Consultas",laboratorio:"Laboratorio",farmacia:"Farmacia",rayosx:"Rayos X",ecografia:"Ecografía",procedimiento:"Procedimientos",operacion:"Operaciones",hospitalizacion:"Hospitalización"},Xe=Object.values((Array.isArray(t.detalles)?t.detalles:[]).reduce((i,l)=>{const c=String(l?.servicio_tipo||"procedimiento").toLowerCase();return i[c]||(i[c]={key:c,label:$e[c]||"Otros servicios",subtotal:0,items:[]}),i[c].subtotal+=Number(l?.subtotal||0),i[c].items.push(l),i},{})).map(i=>{const l=i.items.map(c=>{const re=String(c?.descripcion||"Servicio").trim(),K=P($e[String(c?.servicio_tipo||"").toLowerCase()]||String(c?.servicio_tipo||"Servicio").trim()||"Servicio"),se=String(c?.fecha_programada||"").slice(0,10),O=String(c?.hora_programada||"").slice(0,5),T=/^\d{4}-\d{2}-\d{2}$/.test(se)?(()=>{const[it,at,rt]=se.split("-");return`${rt}/${at}/${it}`})():se,ne=Number(c?.cotizacion_id||0)>0&&k.length>1?`[#${Number(c?.cotizacion_id||0)}] `:"",Ze=`${ne}${re}`.length>34?`${`${ne}${re}`.slice(0,31)}...`:`${ne}${re}`,et=Number(c?.cantidad||0),tt=Number(c?.subtotal||0),ot=K||T||O?`<div class="t-submeta">${K?`Servicio: ${K}`:""}${K&&(T||O)?" | ":""}${T?`Fecha: ${P(T)}`:""}${T&&O?" | ":""}${O?`Hora: ${P(O)}`:""}</div>`:"";return`
          <div class="t-item">
            <div class="t-row">
              <div class="t-desc">${Ze} x${et}</div>
              <div class="t-amount">${C(tt)}</div>
            </div>
            ${ot}
          </div>`}).join("");return`
        <div class="t-section">${i.label}</div>
        ${l}
        <div class="t-row">
          <div class="t-desc"><strong>Subtotal ${i.label}</strong></div>
          <div class="t-amount">${C(i.subtotal)}</div>
        </div>`}).join(""),we=`
      <style>
        * { box-sizing: border-box; }
        .ticket-80 {
          width: 100%;
          max-width: 320px;
          margin: 0 auto;
          padding: 8px 10px;
          font-family: "Courier New", "Lucida Console", monospace;
          font-size: 11px;
          line-height: 1.2;
          color: #111827;
          font-weight: 700;
        }
        .ticket-80 .t-center { text-align: center; }
        .ticket-80 .t-logo { height: 50px; margin: 0 auto 4px; display: block; image-rendering: -webkit-optimize-contrast; filter: contrast(1.15) saturate(1.05); }
        .ticket-80 .t-clinic { margin: 2px 0; font-size: 13px; font-weight: 800; letter-spacing: 0.2px; }
        .ticket-80 .t-line { margin: 1px 0; font-weight: 700; }
        .ticket-80 .t-hr { border: 0; border-top: 1px dashed #6b7280; margin: 6px 0; }
        .ticket-80 .t-title { font-weight: 800; text-transform: uppercase; margin: 0 0 4px; }
        .ticket-80 .t-meta { margin: 1px 0; font-weight: 700; }
        .ticket-80 .t-section { margin: 6px 0 3px; font-weight: 800; text-transform: uppercase; }
        .ticket-80 .t-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
          margin: 1px 0;
        }
        .ticket-80 .t-item { margin: 2px 0 4px; }
        .ticket-80 .t-desc {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ticket-80 .t-submeta {
          margin: 0 0 2px;
          font-size: 9px;
          line-height: 1.1;
          color: #374151;
        }
        .ticket-80 .t-amount { white-space: nowrap; font-weight: 700; }
        .ticket-80 .t-total { font-size: 12px; font-weight: 700; }
        .ticket-80 .t-note { margin-top: 6px; text-align: center; font-size: 10px; color: #111827; font-weight: 700; }
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ticket-80 {
            width: 76mm;
            max-width: 76mm;
            margin: 0;
            padding: 2.5mm;
            font-size: 10.5px;
            line-height: 1.15;
          }
          .ticket-80 .t-clinic { font-size: 12px; }
          .ticket-80 .t-logo { height: 42px; margin-bottom: 3px; }
          .ticket-80 .t-total { font-size: 11.5px; }
        }
      </style>`,Se=`
      <div class="ticket-80">
        <div class="t-center">
          <img src="${Ye}" alt="Logo" class="t-logo" />
          <div class="t-clinic"${m.nombre_color?` style="color:${m.nombre_color};"`:""}>${m.name}</div>
          ${m.slogan?`<div class="t-line" style="font-style:italic;${m.slogan_color?`color:${m.slogan_color};`:""}">${m.slogan}</div>`:""}
          ${m.direccion?`<div class="t-line">${m.direccion}</div>`:""}
          ${Ne?`<div class="t-line">${Ne}</div>`:""}
          ${m.ruc?`<div class="t-line">RUC: ${m.ruc}</div>`:""}
        </div>

        <hr class="t-hr" />
        <div class="t-title">Comprobante de pago #${o}</div>
        <div class="t-meta">Fecha: ${n}</div>
        <div class="t-meta">Paciente: ${r}</div>
        <div class="t-meta">DNI: ${ee||"-"}</div>
        <div class="t-meta">H.C.: ${me||"-"}</div>
        <div class="t-meta">Usuario: ${P(Ke)}</div>
        ${k.length>0?`<div class="t-meta">Atenciones: ${k.map(i=>`#${i}`).join(", ")}</div>`:""}
        ${be?`<div class="t-meta">Referencia origen: ${be}</div>`:""}
        ${Y?`<div class="t-meta">Consulta: ${Je}</div>`:""}
        ${Y?`<div class="t-meta">Fecha consulta: ${qe||"No registrada"}</div>`:""}
        ${Y?`<div class="t-meta">Hora consulta: ${oe||"No registrada"}</div>`:""}
        ${Y&&N==="programada"?`<div class="t-meta">Orden: ${Ge}</div>`:""}
        ${_e?`<div class="t-meta">Profesional: ${_e}</div>`:""}

        <hr class="t-hr" />
        <div class="t-section">Detalle</div>
        ${Xe||'<div class="t-meta">Sin detalles</div>'}

        <hr class="t-hr" />
        ${ae>0?`<div class="t-row"><div class="t-desc"><strong>Descuento</strong></div><div class="t-amount">-${C(ae)}</div></div>`:""}
        <div class="t-row t-total"><div class="t-desc">TOTAL</div><div class="t-amount">${C(t.total)}</div></div>

        ${We?`
          <div class="t-section">Resumen saldo</div>
          ${fe?`<div class="t-meta">${k.length>1?"Atenciones":"Atención"}: ${k.map(i=>`#${i}`).join(", ")}</div>`:""}
          <div class="t-meta">Aplicación: ${je?"Adelanto":"Pago completo"}</div>
          <div class="t-row"><div class="t-desc">Saldo anterior</div><div class="t-amount">${C(he)}</div></div>
          <div class="t-row"><div class="t-desc">Abono aplicado</div><div class="t-amount">${C(ve)}</div></div>
          <div class="t-row"><div class="t-desc">Saldo pendiente</div><div class="t-amount">${C(ye)}</div></div>
        `:""}

        <div class="t-meta">Pago: ${V==="yape"?"Yape":V.toUpperCase()}</div>
        <div class="t-meta">Cobertura: ${de.toUpperCase()}</div>
        <hr class="t-hr" />
        <div class="t-note">Gracias por su preferencia<br />Conserve este comprobante</div>
      </div>`,Qe=`${we}${Se}`;await j.fire({title:"Cobro Procesado ✅",html:Qe,icon:"success",confirmButtonText:"Imprimir Comprobante",showCancelButton:!0,cancelButtonText:"Solo Continuar"}).then(i=>{if(i.isConfirmed){const l=window.open("","_blank"),c=`<!doctype html><html><head><meta charset="utf-8"><title>Comprobante</title>${we}</head><body>${Se}</body></html>`;l.document.write(c),l.document.close(),l.print()}})};if(!a)return e.jsx("div",{children:"Seleccione un servicio primero"});if(!Fe)return e.jsxs("div",{className:"bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-6 rounded",children:[e.jsx("h3",{className:"text-lg font-bold mb-2",children:"⚠️ Solo se pueden procesar cobros de servicios médicos"}),e.jsx("p",{children:"Este módulo no permite cobrar egresos operativos ni otros tipos de egresos. Por favor, utilice el formulario de egresos operativos para registrar gastos administrativos, compras, pagos de servicios, etc."})]});const G=He();return e.jsxs("div",{className:"bg-white p-5 md:p-7 lg:p-8 rounded-2xl shadow-2xl border border-blue-200 w-full max-w-[1200px] mx-auto mt-6 lg:mt-8",children:[e.jsxs("h3",{className:"text-2xl font-bold mb-6 text-blue-800 flex items-center gap-2",children:[e.jsx("span",{className:"text-3xl",children:"💰"})," Módulo de Cobros"]}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-7",children:[e.jsxs("div",{className:"space-y-6 flex flex-col justify-between h-full",children:[e.jsxs("div",{className:"bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm",children:[e.jsxs("h4",{className:"font-semibold mb-2 text-gray-700 flex items-center gap-2 text-lg",children:[e.jsx("span",{className:"text-blue-500",children:"👤"})," Paciente"]}),e.jsx("div",{className:"text-lg lg:text-xl font-bold",children:q||"-"}),e.jsxs("div",{className:"text-base text-gray-600",children:["DNI: ",ee||"-"," | H.C.: ",me||"-"]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block font-semibold mb-2",children:"Tipo de Cobertura:"}),e.jsxs("select",{value:de,onChange:o=>Pe(o.target.value),className:"w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 text-base",children:[e.jsx("option",{value:"particular",children:"Particular"}),e.jsx("option",{value:"seguro",children:"Seguro"}),e.jsx("option",{value:"convenio",children:"Convenio"})]})]}),I>0&&e.jsxs("div",{children:[e.jsxs("label",{className:"block font-semibold mb-2",children:["Motivo del descuento ",e.jsx("span",{className:"text-red-500",children:"*"}),":"]}),e.jsx("textarea",{value:L,onChange:o=>U(o.target.value),className:"w-full border rounded-lg px-3 py-2 h-20 focus:ring-2 focus:ring-blue-300 text-base",placeholder:"Motivo o justificación del descuento (obligatorio)",required:I>0})]})]}),e.jsxs("div",{className:"space-y-6 flex flex-col justify-between h-full",children:[e.jsxs("div",{className:"bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm",children:[typeof B=="function"&&e.jsxs("div",{className:"mb-4 p-3 rounded-xl border border-blue-200 bg-white",children:[e.jsx("h5",{className:"font-semibold text-blue-800 mb-2",children:"Forma de cobro"}),e.jsxs("div",{className:"flex flex-wrap gap-2 mb-2",children:[e.jsx("button",{type:"button",onClick:()=>typeof $=="function"&&$("completo"),className:`px-3 py-2 rounded border whitespace-nowrap ${g==="completo"?"bg-blue-600 text-white border-blue-600":"bg-white hover:bg-gray-50"}`,children:"Cobro completo (automático)"}),e.jsx("button",{type:"button",onClick:()=>typeof $=="function"&&$("parcial"),className:`px-3 py-2 rounded border whitespace-nowrap ${g==="parcial"?"bg-blue-600 text-white border-blue-600":"bg-white hover:bg-gray-50"}`,children:"Adelanto (monto manual)"})]}),g==="parcial"&&e.jsxs("div",{className:"flex flex-wrap items-center gap-2 md:gap-3 mb-2",children:[e.jsx("input",{id:"monto-abono-modulo",type:"number",min:"0",step:"0.01",value:E??"",onChange:o=>B(o.target.value),className:"border rounded px-3 py-2 bg-white w-full sm:w-40",placeholder:"0.00"}),e.jsx("button",{type:"button",onClick:()=>typeof w=="function"&&w(),className:"px-3 py-2 rounded border bg-white hover:bg-gray-50 whitespace-nowrap",children:"Mitad"}),e.jsx("button",{type:"button",onClick:()=>typeof H=="function"&&H(),className:"px-3 py-2 rounded border bg-white hover:bg-gray-50 whitespace-nowrap",children:"Máximo pendiente"})]}),e.jsxs("div",{className:"mt-2 text-xs text-gray-600 rounded-md bg-blue-50 px-2 py-1",children:[g==="parcial"?"Adelanto de hoy:":"Cobro automático de hoy:"," S/ ",G.toFixed(2)," de un saldo pendiente de S/ ",Number(z||0).toFixed(2),"."]})]}),e.jsxs("h4",{className:"font-semibold mb-2 text-blue-700 flex items-center gap-2 text-lg",children:[e.jsx("span",{className:"text-blue-400",children:"🧾"})," Detalle del Servicio"]}),Re.map((o,t)=>{let s=o.subtotal_mostrar;g!=="parcial"&&(typeof s!="number"||s<=0)&&typeof o.precio_publico=="number"&&(s=o.precio_publico);const n=String(o.medico_nombre_completo||`${o.medico_nombre||""} ${o.medico_apellido||""}`).trim(),r=Math.max(0,Number(o?.subtotal_original||0)-Number(o?.subtotal_mostrar||0)),p=te(o,t);return e.jsxs("div",{className:"flex justify-between items-center text-base",children:[e.jsxs("span",{children:[o.descripcion,Number(o?.cotizacion_id||0)>0&&Array.isArray(a?.cotizacion_ids)&&a.cotizacion_ids.length>1?e.jsxs("span",{className:"block text-xs text-slate-500",children:["Atención #",Number(o.cotizacion_id)]}):null,g==="parcial"?e.jsxs("span",{className:"block text-xs text-gray-500",children:["Aplicado hoy: S/ ",Number(o?.subtotal_mostrar||0).toFixed(2),Number(o?.subtotal_original||0)>0?` de S/ ${Number(o.subtotal_original).toFixed(2)}`:""]}):null,g==="parcial"?e.jsxs("span",{className:"block text-xs text-amber-700",children:["Pendiente en servicio: S/ ",r.toFixed(2)]}):null,n?e.jsx("span",{className:"block text-xs text-gray-500",children:n}):null]}),e.jsxs("span",{className:"font-bold",children:["S/ ",Math.max(0,Number(s||0)).toFixed(2)]})]},p)}),e.jsx("hr",{className:"my-3"}),e.jsxs("div",{className:"flex justify-between items-center font-bold text-lg lg:text-xl",children:[e.jsx("span",{children:"Total:"}),e.jsxs("span",{className:"text-green-600",children:["S/ ",G.toFixed(2)]})]})]}),e.jsx("div",{className:"bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm",children:e.jsx(nt,{tipoDescuento:M,setTipoDescuento:ke,valorDescuento:v,setValorDescuento:Ce,montoOriginal:h.reduce((o,t)=>o+(t.subtotal||0),0),montoDescuentoOverride:I,montoFinalOverride:G,errorDescuento:Ae})}),e.jsxs("div",{children:[e.jsx("label",{className:"block font-semibold mb-2",children:"Método de Pago:"}),e.jsxs("select",{value:V,onChange:o=>Ee(o.target.value),className:"w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 text-base",children:[e.jsx("option",{value:"efectivo",children:"Efectivo"}),e.jsx("option",{value:"tarjeta",children:"Tarjeta"}),e.jsx("option",{value:"transferencia",children:"Transferencia"}),e.jsx("option",{value:"yape",children:"Yape"}),e.jsx("option",{value:"plin",children:"Plin"})]})]}),e.jsxs("div",{className:"flex flex-col md:flex-row gap-4 mt-4",children:[e.jsx("button",{onClick:Ue,disabled:ue,className:"flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 transition-all shadow-md",children:ue?"Procesando...":`💳 Cobrar S/ ${G.toFixed(2)}`}),e.jsx("button",{onClick:W,className:"flex-1 bg-gray-500 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-gray-600 transition-all shadow-md",children:"Cancelar"})]})]})]})]})}export{bt as C};
