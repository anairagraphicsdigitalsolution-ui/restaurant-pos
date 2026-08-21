"use client"

"use client"

import { useState, useRef, useEffect } from "react"
import html2canvas from "html2canvas"
/* ================= ELEMENT ================= */
const createElement = (type, shapeType="rect") => ({
  id: crypto.randomUUID(),
  type,
  shapeType,

  x:100,
  y:80,
  w:120,
  h:60,

  rotate:0,
  opacity:1,
  z:Date.now(),

  locked:false,
  layerName:type,

  text:type==="text"?"Edit Text":"",
  fontSize:16,
  fontFamily:"Poppins",
  fontWeight:600,
  textAlign:"left",

  color:"#ffffff",

  src:"",
  fill:"var(--primary)",
  stroke:"#ffffff",
  strokeWidth:2
})

/* ================= TEMPLATES ================= */
const templates = [
{
  name:"Luxury Gold",
  bg:"linear-gradient(135deg,var(--surface),#000)"
},
{
  name:"Royal Black",
  bg:"linear-gradient(135deg,#000,var(--surface))"
},
{
  name:"Corporate Blue",
  bg:"linear-gradient(135deg,var(--surface-2),#1e3a8a)"
},
{
  name:"Modern White",
  bg:"#ffffff"
},
{
  name:"Dark Glass",
  bg:"linear-gradient(135deg,var(--background),var(--surface-2))"
}
,
{
  name:"Restaurant Gold",
  bg:"linear-gradient(135deg,var(--surface-2),#000)"
},
{
  name:"Doctor",
  bg:"linear-gradient(135deg,#ffffff,#e5e7eb)"
},
{
  name:"Lawyer",
  bg:"linear-gradient(135deg,var(--surface),var(--surface-2))"
},
{
  name:"Salon",
  bg:"linear-gradient(135deg,#581c87,var(--surface))"
},
{
  name:"Gym",
  bg:"linear-gradient(135deg,var(--surface),#000)"
}
]

export default function UltraEditorV8(){

  const canvasRef = useRef(null)

  const [side,setSide] = useState("front")

  const [frontElements,setFrontElements] = useState([])
  const [backElements,setBackElements] = useState([])

  const [business,setBusiness]=useState({
    company:"",
    name:"",
    designation:"",
    phone:"",
    email:"",
    website:"",
    address:"",
logo:""
  })
  const uploadLogo=(file)=>{
 const reader=new FileReader()

 reader.onload=()=>{
   setBusiness({
     ...business,
     logo:reader.result
   })
 }

 reader.readAsDataURL(file)
}

  

const elements =
  side === "front"
    ? frontElements
    : backElements

const setElements =
  side === "front"
    ? setFrontElements
    : setBackElements
  const [selected,setSelected] = useState([])
  const active =
  elements.find(
    e=>selected.includes(e.id)
  )

  const [drag,setDrag] = useState(null)
  const [resize,setResize] = useState(null)
  const [rotate,setRotate] = useState(null)

  const [bg,setBg] = useState(templates[0].bg)
 

  const [history,setHistory] = useState([])
  const [future,setFuture] = useState([])
  const [shadow,setShadow] = useState(true)
const [showGrid,setShowGrid] = useState(true)

  /* ================= HISTORY ================= */
  const save=()=>{
    setHistory(h=>[...h.slice(-50), JSON.stringify(elements)])
    setFuture([])
  }

  const undo=()=>{
    if(!history.length) return
    const prev = JSON.parse(history[history.length-1])
    setFuture(f=>[JSON.stringify(elements),...f])
    setElements(prev)
    setHistory(h=>h.slice(0,-1))
  }

  const redo=()=>{
    if(!future.length) return
    const next = JSON.parse(future[0])
    setHistory(h=>[...h,JSON.stringify(elements)])
    setElements(next)
    setFuture(f=>f.slice(1))
  }

  /* ================= SELECT ================= */
  const select=(e,id)=>{
    e.stopPropagation()
    if(e.shiftKey){
      setSelected(s=> s.includes(id)?s:[...s,id])
    } else {
      setSelected([id])
    }
  }

  /* ================= DRAG ================= */
  const startDrag=(e,id)=>{
    const rect = canvasRef.current.getBoundingClientRect()
    const el = elements.find(x=>x.id===id)
    if(el.locked) return

    select(e,id)

    setDrag({
      id,
      offsetX:e.clientX - rect.left - el.x,
      offsetY:e.clientY - rect.top - el.y
    })
  }

  /* ================= RESIZE ================= */
  const startResize=(e,id)=>{
    e.stopPropagation()
    const el = elements.find(x=>x.id===id)

    setResize({
      id,
      startX:e.clientX,
      startY:e.clientY,
      w:el.w,
      h:el.h
    })
  }

  /* ================= ROTATE ================= */
  const startRotate=(e,id)=>{
    e.stopPropagation()
    const rect = canvasRef.current.getBoundingClientRect()
    const el = elements.find(x=>x.id===id)

    setRotate({
      id,
      cx: rect.left + el.x + el.w/2,
      cy: rect.top + el.y + el.h/2
    })
  }

  /* ================= MOVE ================= */
  const onMove=(e)=>{
    const rect = canvasRef.current.getBoundingClientRect()

    if(drag){
      let x =
Math.round(
(e.clientX - rect.left - drag.offsetX)/10
)*10

let y =
Math.round(
(e.clientY - rect.top - drag.offsetY)/10
)*10

      setElements(els=>els.map(el =>
        selected.includes(el.id)?{...el,x,y}:el
      ))
    }

    if(resize){
      const dx = e.clientX - resize.startX
      const dy = e.clientY - resize.startY

      setElements(els=>els.map(el =>
        el.id===resize.id
          ? {...el,w:Math.max(40,resize.w+dx),h:Math.max(30,resize.h+dy)}
          : el
      ))
    }

    if(rotate){
      const angle = Math.atan2(
        e.clientY - rotate.cy,
        e.clientX - rotate.cx
      ) * 180/Math.PI

      setElements(els=>els.map(el =>
        el.id===rotate.id ? {...el,rotate:angle} : el
      ))
    }
  }

  const stop=()=>{
    if(drag || resize || rotate) save()
    setDrag(null)
    setResize(null)
    setRotate(null)
  }

  /* ================= ADD ================= */
  const addText=()=> setElements(e=>[...e,createElement("text")])
  const addShape=()=> setElements(e=>[...e,createElement("shape")])

  const addImage=(file)=>{
    const r=new FileReader()
    r.onload=()=>{
      setElements(e=>[...e,{...createElement("image"),src:r.result}])
    }
    r.readAsDataURL(file)
  }

  /* ================= UPDATE ================= */
  const update=(patch)=>{
    setElements(els=>els.map(el =>
      selected.includes(el.id)?{...el,...patch}:el
    ))
  }

  /* ================= LAYERS ================= */
  const bringFront=()=>{
    setElements(els=>els.map(el =>
      selected.includes(el.id)?{...el,z:Date.now()}:el
    ))
  }

  const sendBack=()=>{
    setElements(els=>els.map(el =>
      selected.includes(el.id)?{...el,z:0}:el
    ))
  }
  const duplicateElement=()=>{
  if(!active) return

  const copy={
    ...active,
    id:crypto.randomUUID(),
    x:active.x+20,
    y:active.y+20
  }

  setElements(e=>[...e,copy])
}

  /* ================= DELETE ================= */
  const deleteEl=()=>{
    setElements(els=>els.filter(el=>!selected.includes(el.id)))
    setSelected([])
  }
  const exportPNG = async () => {
    

  const canvas =
    await html2canvas(
      canvasRef.current,
      {
        scale:5,
        useCORS:true
      }
    )

  const link =
    document.createElement("a")

  link.download =
    `business-card-${side}.png`

  link.href =
    canvas.toDataURL()

  link.click()
}

  /* ================= UI ================= */
  return (
    <div style={{display:"flex",height:"100vh",background:"var(--background)",color:"#fff"}}>

      {/* LEFT PANEL */}
      <div
  style={{
    width:320,
    padding:20,
    background:"linear-gradient(180deg,var(--surface),var(--surface-2))",
    borderRight:"1px solid rgba(var(--primary-rgb),.15)",
    overflowY:"auto"
  }}
>
        <div style={{marginBottom:20}}>

<h4>Templates</h4>

{templates.map(t=>(
<button
 key={t.name}
 style={premiumBtn}
 onClick={()=>setBg(t.bg)}
>
 {t.name}
</button>
))}

</div>

<div
  style={{
    display:"flex",
    gap:8,
    marginBottom:15
  }}
>

<button
  onClick={()=>setSide("front")}
>
Front
</button>

<button
  onClick={()=>setSide("back")}
>
Back
</button>

</div>

<button style={premiumBtn} onClick={addText}>
➕ Add Text
</button>

<button
 style={premiumBtn}
 onClick={()=>
  setElements(e=>[
   ...e,
   createElement("shape","rect")
  ])
 }
>
⬜ Rectangle
</button>

<button
 style={premiumBtn}
 onClick={()=>
  setElements(e=>[
   ...e,
   createElement("shape","circle")
  ])
 }
>
⭕ Circle
</button>

<button
 style={premiumBtn}
 onClick={()=>
  setElements(e=>[
   ...e,
   createElement("shape","line")
  ])
 }
>
➖ Line
</button>

<button
 style={premiumBtn}
 onClick={()=>
  setElements(e=>[
   ...e,
   createElement("shape","triangle")
  ])
 }
>
🔺 Triangle
</button>

<button style={premiumBtn} onClick={bringFront}>
⬆ Bring Front
</button>

<button style={premiumBtn} onClick={sendBack}>
⬇ Send Back
</button>
        
        <input type="file" onChange={(e)=>addImage(e.target.files[0])}/>
        <input
  type="file"
  onChange={(e)=>
    uploadLogo(e.target.files[0])
  }
/>

        <hr/>

<input
  placeholder="Company"
  value={business.company}
  onChange={(e)=>
    setBusiness({
      ...business,
      company:e.target.value
    })
  }
/>


<input
  placeholder="Owner Name"
  value={business.name}
  onChange={(e)=>
    setBusiness({
      ...business,
      name:e.target.value
    })
  }
/>

<input
  placeholder="Phone"
  value={business.phone}
  onChange={(e)=>
    setBusiness({
      ...business,
      phone:e.target.value
    })
  }
/>

<input
  style={input}
  placeholder="Website"
  value={business.website}
  onChange={(e)=>
    setBusiness({
      ...business,
      website:e.target.value
    })
  }
/>



{active && (
<>
<hr/>

<h4>Properties</h4>


<input
style={input}
placeholder="Text"
value={active.text || ""}
onChange={(e)=>
 update({
  text:e.target.value
 })
}
/>
<select
value={active.textAlign || "left"}
onChange={(e)=>
 update({
  textAlign:e.target.value
 })
}
>
<option value="left">Left</option>
<option value="center">Center</option>
<option value="right">Right</option>
</select>
<input
type="range"
min="0"
max="100"
value={active.radius || 0}
onChange={(e)=>
 update({
  radius:Number(e.target.value)
 })
}
/>
<input
type="color"
value={active.fill || "var(--primary)"}
onChange={(e)=>
 update({
  fill:e.target.value
 })
}
/>
<input
type="color"
value={active.stroke || "#ffffff"}
onChange={(e)=>
 update({
  stroke:e.target.value
 })
}
/>
<input
type="range"
min="0"
max="20"
value={active.strokeWidth || 2}
onChange={(e)=>
 update({
  strokeWidth:Number(e.target.value)
 })
}
/>
<label>
<input
type="checkbox"
checked={active.shadow || false}
onChange={(e)=>
 update({
  shadow:e.target.checked
 })
}
/>
 Shadow
</label>
<label>
<input
type="checkbox"
checked={active.locked || false}
onChange={(e)=>
 update({
  locked:e.target.checked
 })
}
/>
 Lock
</label>
<input
type="range"
min="20"
max="600"
value={active.w || 100}
onChange={(e)=>
 update({
  w:Number(e.target.value)
 })
}
/>
<input
type="range"
min="20"
max="600"
value={active.h || 100}
onChange={(e)=>
 update({
  h:Number(e.target.value)
 })
}
/>
<input
value={active.layerName || ""}
onChange={(e)=>
 update({
  layerName:e.target.value
 })
}
/>
<input
type="color"
value={active.color || "#ffffff"}
onChange={(e)=>
 update({
  color:e.target.value
 })
}
/>


<input
type="range"
min="10"
max="120"
value={active.fontSize || 16}
onChange={(e)=>
 update({
  fontSize:Number(e.target.value)
 })
}
/>


{/* 👇 YAHAN ADD KARNA HAI */}

<select
 value={active.fontFamily || "Poppins"}
 onChange={(e)=>
  update({
   fontFamily:e.target.value
  })
 }
>
 <option>Poppins</option>
 <option>Montserrat</option>
 <option>Roboto</option>
 <option>Inter</option>
</select>


<select
 value={active.fontWeight || 600}
 onChange={(e)=>
  update({
   fontWeight:Number(e.target.value)
  })
 }
>
 <option value={400}>Regular</option>
 <option value={600}>SemiBold</option>
 <option value={700}>Bold</option>
 <option value={800}>Extra Bold</option>
</select>


<input
 type="range"
 min="0"
 max="360"
 value={active.rotate || 0}
 onChange={(e)=>
  update({
   rotate:Number(e.target.value)
  })
 }
/>


<input
 type="range"
 min="0"
 max="1"
 step="0.1"
 value={active.opacity || 1}
 onChange={(e)=>
  update({
   opacity:Number(e.target.value)
  })
 }
/>


</>
)}


        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
        <button onClick={duplicateElement}>
Duplicate
</button>
        <button onClick={deleteEl}>Delete</button>
        <button onClick={bringFront}>Front</button>
        <button onClick={sendBack}>Back</button>
        <button style={premiumBtn} onClick={exportPNG}>
  Export HD PNG
</button>

<hr/>

<h4>Layers</h4>

{elements
.sort((a,b)=>b.z-a.z)
.map(el=>(
<div
 key={el.id}
 onClick={()=>setSelected([el.id])}
 style={{
   padding:10,
   borderRadius:12,
   marginBottom:8,
   cursor:"pointer",
   background:selected.includes(el.id)
   ? "rgba(var(--primary-rgb),.12)"
   : "rgba(255,255,255,.03)"
 }}
>
 {el.type}
</div>
))}

</div>
 
      
      

      {/* CANVAS */}
      <div style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center"}}>
        <div
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseUp={stop}
          onMouseDown={()=>setSelected([])}
          style={{
  width:1050,
  height:600,
  boxShadow:"0 30px 80px rgba(0,0,0,.55)",
  border:"1px solid rgba(var(--primary-rgb),.18)",
  overflow:"hidden",
  background:bg,
backgroundImage:`
linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),
linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)
`,
backgroundSize:"25px 25px",
  position:"relative",
  borderRadius:24,
backdropFilter:"blur(20px)"
}}
            
        >

          <div
  style={{
    position:"absolute",
    left:40,
    top:40
  }}
>
  {business.logo && (
<img
 src={business.logo}
 alt=""
 style={{
   width:90,
   height:90,
   objectFit:"contain",
   marginBottom:15
 }}
/>
)}
  <h1>{business.company}</h1>

  <h3>{business.name}</h3>

  <p>{business.designation}</p>

  <p>{business.phone}</p>

  <p>{business.email}</p>

  <p>{business.website}</p>
</div>
{elements.sort((a,b)=>a.z-b.z).map(el=>{

  const isSelected = selected.includes(el.id)

  return (
              <div key={el.id}
                onMouseDown={(e)=>startDrag(e,el.id)}
                style={{
                  position:"absolute",
                  left:el.x,
                  top:el.y,
                  transform:`
translateY(${isSelected ? "-2px" : "0"})
rotate(${el.rotate}deg)
`,
                }}
              >

                {el.type==="text" && (
                  <div
 contentEditable
 style={{
 color:el.color,
 fontSize:el.fontSize,
 fontFamily:el.fontFamily,
 fontWeight:el.fontWeight,
 opacity:el.opacity,
 textAlign:el.textAlign,
 width:el.w
}}
>
                    {el.text}
                  </div>
                )}

                {el.type==="shape" && (
<>
{el.shapeType==="rect" && (
<div
 style={{
 width:el.w,
 height:el.h,
 background:el.fill,
 borderRadius:el.radius || 0,
 boxShadow:el.shadow
 ? "0 10px 30px rgba(0,0,0,.35)"
 : "none"
}}
/>
)}

{el.shapeType==="circle" && (
<div
 style={{
  width:el.w,
  height:el.w,
  borderRadius:"50%",
  background:el.fill
 }}
/>
)}

{el.shapeType==="line" && (
<div
 style={{
  width:el.w,
  height:el.strokeWidth,
  background:el.fill
 }}
/>
)}

{el.shapeType==="triangle" && (
<div
 style={{
  width:0,
  height:0,
  borderLeft:`${el.w/2}px solid transparent`,
  borderRight:`${el.w/2}px solid transparent`,
  borderBottom:`${el.h}px solid ${el.fill}`
 }}
/>
)}
</>
)}
                {el.type==="image" && (
                  <img
  src={el.src}
  alt=""
  style={{
    width:el.w,
    height:el.h
  }}
/>
                )}

                {isSelected && (
                  <>
                    <div
  style={{
    position:"absolute",
    inset:0,
    border:"2px dashed var(--primary)",
boxShadow:"0 0 0 1px rgba(var(--primary-rgb),.3)"
  }}
/>

                    <div
  onMouseDown={(e)=>startResize(e,el.id)}
  style={{
    position:"absolute",
    right:-6,
    bottom:-6,
    width:16,
height:16,
borderRadius:"50%",
border:"2px solid #fff",
boxShadow:"0 0 10px rgba(var(--primary-rgb),.5)",
    background:"var(--primary)"
  }}
/>

                    <div onMouseDown={(e)=>startRotate(e,el.id)}
                      style={{position:"absolute",top:-20,left:"50%",width:10,height:10,background:"var(--primary)",
borderRadius:"50%"}}/>
                  </>
                )}

              </div>
            )
          })}

        </div>
      </div>

    </div>
  )
}
/* UI */
const container={padding:20,background:"var(--background)",color:"#fff",minHeight:"100vh"}
const title={fontSize:28}
const layout={display:"grid",gridTemplateColumns:"1fr 420px",gap:20}
const panel={background:"rgba(255,255,255,0.05)",padding:20,borderRadius:16,display:"flex",flexDirection:"column",gap:10}
const input={padding:10,background:"#111",borderRadius:8,color:"#fff"}
const preview={display:"flex",justifyContent:"center",alignItems:"center"}
const card={width:320,height:200,padding:16,borderRadius:16}
const btn={padding:10,background:"var(--info)",borderRadius:8,color:"#fff"}
const qrStyle={position:"absolute",right:10,bottom:10,width:70}
const tabBtn=(active)=>({flex:1,padding:8,background:active?"var(--success)":"var(--surface-2)",border:"none",color:"#fff"})
const templateGrid={display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}
const templateCard={background:"#111",padding:10,borderRadius:10,cursor:"pointer"}
const premiumBtn={
  width:"100%",
  padding:"12px",
  marginBottom:10,
  borderRadius:14,
  border:"1px solid rgba(var(--primary-rgb),.25)",
  background:"rgba(255,255,255,.03)",
  color:"var(--primary)",
  fontWeight:700,
  cursor:"pointer"
}