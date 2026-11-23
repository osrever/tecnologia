import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'

const date = value => new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}).format(value)
const score = value => value==null ? '—' : value.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})
const letter = i => 'ABCD'[i]
const expectedOrigin = import.meta.env.VITE_APP_ORIGIN
const scriptApi = globalThis.google?.script?.run
async function api(path, data) {
  if (scriptApi) {
    const storageKey='tic-session'
    const token=sessionStorage.getItem(storageKey)
    const result=await new Promise((resolve,reject)=>scriptApi.withSuccessHandler(resolve).withFailureHandler(reject)
      .request(path,data===undefined?null:data,token))
    if (result.error) throw Error(result.error)
    if (result.token) sessionStorage.setItem(storageKey,result.token)
    if (path==='/logout') sessionStorage.removeItem(storageKey)
    return result.value
  }
  const response = await fetch('/api'+path, data===undefined ? {} : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  })
  if (response.status===204) return null
  let result
  try {result=await response.json()} catch {throw Error('El servidor de la aplicación no está disponible.')}
  if (!response.ok) throw Error(result.error)
  return result
}

function App() {
  const [me,setMe]=useState(null)
  const [page,setPage]=useState('loading')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [teacher,setTeacher]=useState(false)
  const [topics,setTopics]=useState([])
  const [confirmed,setConfirmed]=useState(false)
  const [exam,setExam]=useState(null)
  const [index,setIndex]=useState(0)
  const [result,setResult]=useState(null)
  const [review,setReview]=useState(null)
  const [history,setHistory]=useState(null)
  const [confirmFinish,setConfirmFinish]=useState(false)

  async function restore() {
    const user=await api('/me')
    setMe(user)
    if (user.role==='teacher') return setPage('teacher')
    const active=await api('/exam')
    setExam(active)
    setIndex(0)
    setPage(active?'exam':'topics')
  }
  useEffect(()=>{
    if (!scriptApi && expectedOrigin && location.origin!==expectedOrigin) return setPage('landing')
    if (location.hostname.endsWith('.github.io')) return setPage('landing')
    restore().catch(()=>setPage('login'))
  },[])
  useEffect(()=>{
    document.getElementById('main-title')?.focus()
  },[page,index])
  useEffect(()=>{
    if (page!=='exam') return
    const warn=e=>{e.preventDefault();e.returnValue=''}
    addEventListener('beforeunload',warn)
    return ()=>removeEventListener('beforeunload',warn)
  },[page])
  async function action(fn) {
    setError('')
    setBusy(true)
    try {await fn()} catch(e) {setError(e.message)}
    finally {setBusy(false)}
  }
  const historyPage=()=>action(async()=>{setHistory(await api('/history'));setPage('history')})
  const reviewPage=id=>action(async()=>{setReview(await api('/exam/'+id+'/review'));setPage('review')})
  const logout=()=>action(async()=>{
    if (page==='exam' && !window.confirm('¿Cerrar sesión? Podrás continuar el examen cuando vuelvas a acceder.')) return
    await api('/logout',{})
    setMe(null);setExam(null);setResult(null);setReview(null);setHistory(null);setTopics([]);setConfirmed(false);setPage('login')
  })
  const toggle=id=>{
    setConfirmed(false)
    setTopics(values=>values.includes(id)?values.filter(item=>item!==id):[...values,id])
  }
  const topicName=id=>me?.topics.find(t=>t.id===id)?.title ?? 'Tema '+id
  const title=text=><h1 id="main-title" tabIndex="-1">{text}</h1>
  const answered=exam ? Object.values(exam.answers).filter(value=>value!=null).length : 0
  const q=exam?.items[index]
  const stats=history?.results??[]
  return <>
    <a className="skip" href="#contenido">Saltar al contenido</a>
    <header className="top">
      <div className="shell course"><div className="mark" aria-hidden="true">TIC</div>
      <div><strong>Autoevaluación TIC Escrita</strong><div className="identity">Grado en Periodismo · Universidad de Sevilla</div></div>
      {me && <div className="session">{me.student && <span>{me.student.first} {me.student.last} · Grupo {me.student.group_no}</span>}<button className="ghost" disabled={busy} onClick={logout}>Cerrar sesión</button></div>}
      </div>
    </header>
    <main id="contenido" className="shell">
      {error && <p role="alert" className="alert">{error}</p>}
      {page==='loading' && <p role="status">Cargando…</p>}
      {page==='landing' && <section className="card access">
        {title('Práctica para el examen')}
        <p>Tecnologías para la Información y la Comunicación Escrita · 2710009</p>
        <p>Curso 2026–2027 · Grupos 3 y 4</p>
        {expectedOrigin ? <a className="primary button" href={expectedOrigin}>Acceder a la aplicación</a> :
          <p className="notice">El acceso al alumnado se habilitará cuando esté configurado el servidor seguro y validado el banco de preguntas.</p>}
      </section>}
      {page==='login' && <section className="card access">
        <div className="eyebrow">Curso 2026–2027 · Grupos 3 y 4</div>
        {title(teacher?'Acceso del profesorado':'Práctica para el examen')}
        <p className="muted">Tecnologías para la Información y la Comunicación Escrita · 2710009</p>
        <form onSubmit={e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));action(async()=>{
          await api(teacher?'/teacher/login':'/login',data)
          await restore()
        })}}>
          {teacher ? <label key="teacher">Código de administración<input name="code" type="password" autoComplete="current-password" required maxLength={160}/></label> :
            <label key="student">Nombre y apellidos<input name="name" autoComplete="name" required maxLength={300} aria-describedby="name-format"/><span id="name-format" className="muted">Escribe «Nombre Apellidos» o «Apellidos, Nombre».</span></label>}
          <button className="primary" disabled={busy}>Acceder</button>
        </form>
        <button className="text" onClick={()=>{setTeacher(!teacher);setError('')}}>{teacher?'Acceso del alumnado':'Acceso del profesorado'}</button>
      </section>}
      {page==='topics' && <>
        <div className="heading"><div>{title('Elige los temas')}<p className="muted">20 preguntas · Sin límite de tiempo</p></div><button onClick={historyPage} disabled={busy}>Ver mi progreso</button></div>
        <section className="card">
          <div className="actions"><button onClick={()=>{setTopics(me.topics.map(t=>t.id));setConfirmed(false)}}>Seleccionar todos</button>
            <button onClick={()=>{setTopics([]);setConfirmed(false)}}>Deseleccionar todos</button></div>
          <fieldset className="topics"><legend>Temas disponibles</legend>{me.topics.map(t=><label className={topics.includes(t.id)?'selected':''} key={t.id}><input type="checkbox" checked={topics.includes(t.id)} onChange={()=>toggle(t.id)}/><span><small>Tema {t.id}</small>{t.title===('Tema '+t.id)?'Título pendiente':t.title}</span></label>)}</fieldset>
          <div className="actions footer"><strong aria-live="polite">{topics.length} {topics.length===1?'tema seleccionado':'temas seleccionados'}</strong>
            {confirmed ? <button className="primary" disabled={busy} onClick={()=>action(async()=>{
              const current=await api('/exam',{topics});setExam(current);setIndex(0);setConfirmFinish(false);setPage('exam')
            })}>Comenzar examen</button> : <button className="primary" disabled={!topics.length} onClick={()=>setConfirmed(true)}>Confirmar selección</button>}
          </div>
        </section>
      </>}
      {page==='exam' && q && <>
        <div className="heading"><div>{title('Pregunta '+(index+1)+' de 20')}<p>{answered} de 20 respondidas</p></div>
          <button disabled={busy} onClick={()=>setConfirmFinish(true)}>Finalizar examen</button></div>
        <progress aria-label="Preguntas respondidas" value={answered} max="20"/>
        <div className="exam-layout">
          <section className="card">
            <fieldset key={index} disabled={busy}><legend className="prompt">{q.prompt}</legend>
            {q.options.map((option,i)=><label className={'answer '+(exam.answers[index]===i?'selected':'')} key={i}>
              <input type="radio" name="answer" checked={exam.answers[index]===i} onChange={()=>action(async()=>{
                await api('/exam/'+exam.id+'/answer',{index,choice:i});setExam({...exam,answers:{...exam.answers,[index]:i}})
              })}/><strong>{letter(i)}.</strong> {option}</label>)}</fieldset>
            <button className="text" disabled={busy || exam.answers[index]==null} onClick={()=>action(async()=>{
              await api('/exam/'+exam.id+'/answer',{index,choice:null});setExam({...exam,answers:{...exam.answers,[index]:null}})
            })}>Dejar en blanco</button>
            <div className="actions footer"><button disabled={busy||index===0} onClick={()=>setIndex(index-1)}>Anterior</button>
              <button disabled={busy||index===19} onClick={()=>setIndex(index+1)}>Siguiente</button></div>
          </section>
          <nav className="card navigator" aria-label="Preguntas del examen">
            <h2>Navegación</h2><div className="numbers">{exam.items.map((_,i)=><button key={i} disabled={busy} aria-current={i===index?'step':undefined}
              aria-label={'Pregunta '+(i+1)+', '+(exam.answers[i]!=null?'respondida':'pendiente')}
              className={(exam.answers[i]!=null?'answered ':'')+(i===index?'current':'')} onClick={()=>setIndex(i)}>{i+1}</button>)}</div>
            <p className="muted">En azul, respondidas.</p>
          </nav>
        </div>
        {confirmFinish && <section className="card confirmation" aria-labelledby="confirm-title">
          <h2 id="confirm-title">¿Finalizar examen?</h2>
          <p>{answered} respondidas · {20-answered} pendientes</p>
          <div className="actions"><button onClick={()=>setConfirmFinish(false)} disabled={busy}>Volver al examen</button>
            <button className="primary" disabled={busy} onClick={()=>action(async()=>{
              setResult(await api('/exam/'+exam.id+'/finish',{}));setExam(null);setConfirmFinish(false);setPage('result')
            })}>Confirmar y corregir</button></div>
        </section>}
      </>}
      {page==='result' && result && <section className="card">
        {title('Resultado del examen')}
        <p>{me.student.first} {me.student.last} · Grupo {me.student.group_no} · {date(result.finished)}</p>
        <p>{result.topics.map(topicName).join(' · ')}</p>
        <div className={'result '+(result.passed?'passed':'failed')}><strong>{score(result.grade)}</strong><span>sobre 10 · {result.passed?'Aprobado':'Suspenso'}</span></div>
        <p>{result.right} aciertos · {result.wrong} fallos · {result.blank} en blanco · {Math.floor(result.duration/60)} min {result.duration%60} s</p>
        <div className="actions"><button className="primary" onClick={()=>{setConfirmed(false);setPage('topics')}}>Realizar otra prueba</button>
          <button onClick={()=>reviewPage(result.id)} disabled={busy}>Revisar respuestas</button><button onClick={historyPage} disabled={busy}>Consultar el historial</button><button onClick={logout} disabled={busy}>Cerrar sesión</button></div>
      </section>}
      {page==='review' && review && <>
        <div className="heading">{title('Revisión del examen')}<button onClick={historyPage} disabled={busy}>Ver mi progreso</button></div>
        {review.items.map((item,i)=><article className="card review" key={i}>
          <p className="eyebrow">{topicName(item.topic)} · {review.answers[i]==null?'En blanco':review.answers[i]===item.correct?'Correcta':'Incorrecta'}</p>
          <h2>{i+1}. {item.prompt}</h2>
          <ul>{item.options.map((option,j)=><li key={j} className={j===item.correct?'correct':''}>
            {letter(j)}. {option} {j===item.correct && <strong>· Respuesta correcta</strong>} {j===review.answers[i] && <strong>· Tu respuesta</strong>}
          </li>)}</ul><p>{item.explanation}</p><p className="muted">Referencia: {item.reference}</p>
        </article>)}
        <button className="primary" onClick={()=>{setConfirmed(false);setPage('topics')}}>Realizar otra prueba</button>
      </>}
      {page==='history' && <>
        <div className="heading">{title('Mi progreso')}<button onClick={()=>setPage('topics')}>Elegir temas</button></div>
        <div className="metrics">{[['Exámenes',stats.length],['Nota media',score(stats.length?stats.reduce((a,r)=>a+r.grade,0)/stats.length:null)],
          ['Mejor nota',score(stats.length?Math.max(...stats.map(r=>r.grade)):null)],['Última nota',score(stats[0]?.grade)]].map(([label,value])=>
          <div className="card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <section className="card review"><h2>Evolución de las notas</h2>
          {!stats.length && <p>Aún no hay exámenes completados.</p>}
          {stats.map(r=><div className="history-row" key={r.id}><span>{date(r.finished)}</span><meter aria-label={'Nota de '+date(r.finished)} min="0" max="10" value={r.grade}/><strong>{score(r.grade)}</strong><button disabled={busy} onClick={()=>reviewPage(r.id)}>Revisar</button></div>)}
        </section>
        <section className="card"><h2>Aciertos por tema</h2>
          {Object.entries(history.stats).map(([id,value])=><div className="history-row" key={id}><span>{topicName(Number(id))}</span><meter aria-label={topicName(Number(id))} min="0" max={value.total} value={value.right}/><strong>{Math.round(value.right*100/value.total)} %</strong></div>)}
          {!Object.keys(history.stats).length && <p>Los datos aparecerán al completar un examen.</p>}
        </section>
      </>}
      {page==='teacher' && <Teacher topics={me.topics}/>}
    </main>
    <footer className="shell bottom">Curso 2026–2027. Las notas son orientativas y no cuentan para la evaluación oficial.</footer>
  </>
}

function download(name, contents, type='application/json') {
  const url=URL.createObjectURL(new Blob([contents],{type}))
  const link=document.createElement('a')
  link.href=url
  link.download=name
  link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

const fresh=()=>({topic:1,concept:'',prompt:'',options:['','','',''],correct:0,explanation:'',reference:'',difficulty:'media',status:'pendiente',active:false})

const percentage = (part,total) => total ? Math.round(part*100/total)+' %' : '—'
const average = rows => rows.length ? rows.reduce((sum,row)=>sum+row.grade,0)/rows.length : null

function Participation({results,name}) {
  const enrolled=results.groups.reduce((sum,g)=>sum+g.enrolled,0)
  const participants=results.groups.reduce((sum,g)=>sum+g.students,0)
  const person=results.individual
  const individualResults=person?.results??[]
  return <>
    <p className="muted">Actividad formativa. Los accesos se atribuyen al nombre introducido y las notas son orientativas.</p>
    <div className="metrics">{[
      ['Estudiantes matriculados',enrolled],['Participantes',participants],['Participación',percentage(participants,enrolled)],
      ['Pruebas iniciadas',results.started],['Pruebas completadas',results.results.length],
      ['Pruebas completadas por participante',score(participants?results.results.length/participants:null)],
      ['Nota media de las pruebas',score(average(results.results))]
    ].map(([label,value])=><div className="card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="card section"><h2>Participación por grupo</h2>
      {results.groups.map(g=><p key={g.group}>Grupo {g.group} · {g.students} de {g.enrolled} participantes ({percentage(g.students,g.enrolled)}) · {g.attempts} pruebas completadas · Nota media {score(g.average)} · Media de notas medias individuales {score(g.studentAverage)}</p>)}
      <h2>Participantes por día</h2>
      {results.daily.length ? results.daily.map(day=><div className="history-row" key={day.day}>
        <span>{day.day.split('-').reverse().join('/')}</span>
        <meter aria-label={'Participantes el '+day.day} min="0" max={participants} value={day.students}/><strong>{day.students}</strong>
      </div>) : <p>No hay accesos registrados en este período.</p>}
    </section>
    {person && <section className="card section">
      <h2>{person.first} {person.last} · Grupo {person.group_no}</h2>
      <p>Primer acceso: {person.firstAccess==null?'—':date(person.firstAccess)} · Último acceso: {person.lastAccess==null?'—':date(person.lastAccess)}</p>
      <p>{person.sessions} sesiones iniciadas · {person.started} pruebas iniciadas · {individualResults.length} completadas</p>
      <p>Nota media: {score(average(individualResults))} · Mejor nota: {score(individualResults.length ? Math.max(...individualResults.map(r=>r.grade)) : null)}</p>
      <p>Temas practicados: {[...new Set(individualResults.flatMap(r=>r.topics))].sort((a,b)=>a-b).map(name).join(' · ') || '—'}</p>
      <h3>Evolución de resultados</h3>
      {individualResults.map(r=><div className="history-row" key={r.id}><span>{date(r.finished)}</span>
        <meter aria-label={'Nota de '+date(r.finished)} min="0" max="10" value={r.grade}/><strong>{score(r.grade)}</strong></div>)}
    </section>}
  </>
}

function Teacher({topics}) {
  const [tab,setTab]=useState('results')
  const [filters,setFilters]=useState({})
  const [results,setResults]=useState(null)
  const [bank,setBank]=useState([])
  const [bankFilters,setBankFilters]=useState({})
  const [question,setQuestion]=useState(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const params=new URLSearchParams(Object.entries(filters).filter(([,v])=>v).map(([key,value])=>{
    if (key==='start') return [key,new Date(value+'T00:00:00').valueOf()]
    if (key==='end') {
      const next=new Date(value+'T00:00:00')
      next.setDate(next.getDate()+1)
      return [key,next.valueOf()]
    }
    return [key,value]
  })).toString()
  const name=id=>topics.find(t=>t.id===id)?.title??'Tema '+id
  const edit=(key,value)=>setQuestion(q=>({...q,[key]:value}))
  useEffect(()=>{
    let current=true
    setError('')
    setBusy(true)

    const path=tab==='results'?'/teacher/results?'+params:'/teacher/bank'
    api(path).then(value=>{
      if (current) (tab==='results'?setResults:setBank)(value)
    }).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setBusy(false)})
    return ()=>{current=false}
  },[tab,params])
  async function save(event) {
    event.preventDefault()
    setBusy(true);setError('')
    try {
      await api('/teacher/bank',question)
      setBank(await api('/teacher/bank'))
      setQuestion(null)
    } catch(e) {setError(e.message)}
    finally {setBusy(false)}
  }
  async function remove() {
    if (!window.confirm('¿Eliminar esta pregunta del banco? Los exámenes anteriores conservan su versión.')) return
    setBusy(true);setError('')
    try {
      await api('/teacher/bank/delete',{id:question.id,version:question.version})
      setBank(await api('/teacher/bank'))
      setQuestion(null)
    } catch(e) {setError(e.message)}
    finally {setBusy(false)}
  }
  const search=(key,value)=>setFilters({...filters,[key]:value})
  const filter=(key,value)=>setBankFilters({...bankFilters,[key]:value})
  return <>
    <h1 id="main-title" tabIndex="-1">Panel del profesorado</h1>
    <nav className="actions section" aria-label="Panel del profesorado">
      <button className={tab==='results'?'primary':''} onClick={()=>setTab('results')}>Resultados</button>
      <button className={tab==='bank'?'primary':''} onClick={()=>setTab('bank')}>Banco de preguntas</button>
    </nav>
    {error && <p role="alert" className="alert">{error}</p>}
    {tab==='results' && <>
      <section className="card section">
        <div className="filters">
          <label>Grupo<select value={filters.group??''} onChange={e=>search('group',e.target.value)}><option value="">Todos</option><option>3</option><option>4</option></select></label>
          <label>Estudiante<select value={filters.student??''} onChange={e=>search('student',e.target.value)}><option value="">Todos</option>
            {results?.students.map(s=><option value={s.id} key={s.id}>{s.last}, {s.first} · G{s.group_no}</option>)}</select></label>
          <label>Tema<select value={filters.topic??''} onChange={e=>search('topic',e.target.value)}><option value="">Todos</option>
            {topics.map(t=><option value={t.id} key={t.id}>{t.title}</option>)}</select></label>
          <label>Desde<input type="date" value={filters.start??''} onChange={e=>search('start',e.target.value)}/></label>
          <label>Hasta<input type="date" value={filters.end??''} onChange={e=>search('end',e.target.value)}/></label>
        </div>
        {scriptApi ? <button onClick={async()=>{
          try {download('resultados.csv',await api('/teacher/results?format=csv&'+params),'text/csv;charset=utf-8')}
          catch (e) {setError(e.message)}
        }}>Descargar CSV</button> : <a className="button" href={'/api/teacher/results?format=csv&'+params}>Descargar CSV</a>}
      </section>
      {results && <>
        <Participation results={results} name={name}/>
        <section className="card section">
          <h2>Intentos</h2>
          {results.results.length===0 ? <p>No hay intentos con estos filtros.</p> :
            <div className="table-wrap" tabIndex="0" aria-label="Tabla de intentos"><table><thead><tr>{['Estudiante','Grupo','Fecha','Temas','Nota','Duración'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{results.results.map(r=><tr key={r.id}><th scope="row">{r.student.last}, {r.student.first}</th><td>{r.student.group_no}</td><td>{date(r.finished)}</td><td>{r.topics.join(', ')}</td><td>{score(r.grade)}</td><td>{Math.floor(r.duration/60)} min {r.duration%60} s</td></tr>)}</tbody></table></div>}
        </section>
        <section className="card section"><h2>Estadísticas por tema</h2>
          <div className="table-wrap" tabIndex="0" aria-label="Estadísticas por tema"><table>
            <thead><tr>{['Tema','Selecciones','Respondidas','Correctas','Incorrectas'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{Object.entries(results.practice).map(([id,stats])=><tr key={id}><th scope="row">{name(Number(id))}</th>
              <td>{stats.selected}</td><td>{stats.answered}</td><td>{percentage(stats.right,stats.answered)}</td>
              <td>{percentage(stats.wrong,stats.answered)}</td></tr>)}</tbody>
          </table></div>
          {['questions','concepts'].map((key,i)=><div key={key}><h2>{i?'Conceptos con mayor tasa de fallos':'Preguntas con mayor tasa de fallos'}</h2>
            {results[key].map((q,j)=><p key={j}>{q.label} · {name(q.topic)} · {percentage(q.wrong,q.total-q.blank)} de fallos ({q.wrong}/{q.total-q.blank}) · {q.blank} en blanco</p>)}</div>)}
        </section>
      </>}
    </>}
    {tab==='bank' && <section className="card">
      <div className="actions"><button className="primary" onClick={()=>setQuestion(fresh())}>Nueva pregunta</button><button disabled={busy} onClick={()=>download('banco-privado.json',JSON.stringify(bank,null,2))}>Exportar banco privado</button></div>
      {question && <form className="editor" onSubmit={save}>
        <h2>{question.id?'Editar pregunta':'Nueva pregunta'}</h2>
        <label>Tema<select value={question.topic} onChange={e=>edit('topic',Number(e.target.value))}>{topics.map(t=><option value={t.id} key={t.id}>{t.title}</option>)}</select></label>
        {[['concept','Concepto'],['prompt','Enunciado'],['explanation','Explicación'],['reference','Referencia documental']].map(([key,label])=>
          <label key={key}>{label}<textarea value={question[key]} onChange={e=>edit(key,e.target.value)} maxLength={4000} required/></label>)}
        {question.options.map((value,i)=><label key={i}>Opción {letter(i)}<input required maxLength={1000} value={value} onChange={e=>edit('options',question.options.map((o,j)=>i===j?e.target.value:o))}/></label>)}
        <label>Respuesta correcta<select value={question.correct} onChange={e=>edit('correct',Number(e.target.value))}>{question.options.map((_,i)=><option key={i} value={i}>{letter(i)}</option>)}</select></label>
        <label>Dificultad<select value={question.difficulty} onChange={e=>edit('difficulty',e.target.value)}>{['baja','media','alta'].map(d=><option key={d}>{d}</option>)}</select></label>
        <label>Validación<select value={question.status} onChange={e=>setQuestion({...question,status:e.target.value,active:e.target.value==='validada' && question.active})}><option>pendiente</option><option>validada</option></select></label>
        <label className="check"><input type="checkbox" checked={question.active} disabled={question.status!=='validada'} onChange={e=>edit('active',e.target.checked)}/>Activa en nuevos exámenes</label>
        <div className="actions"><button className="primary" disabled={busy}>Guardar pregunta</button><button type="button" disabled={busy} onClick={()=>setQuestion(null)}>Cancelar</button>{question.id && <button type="button" disabled={busy} onClick={remove}>Eliminar pregunta</button>}</div>
      </form>}
      <div className="filters section">
        <label>Tema<select onChange={e=>filter('topic',e.target.value)} value={bankFilters.topic??''}><option value="">Todos</option>{topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
        <label>Dificultad<select onChange={e=>filter('difficulty',e.target.value)} value={bankFilters.difficulty??''}><option value="">Todas</option>{['baja','media','alta'].map(d=><option key={d}>{d}</option>)}</select></label>
        <label>Validación<select onChange={e=>filter('status',e.target.value)} value={bankFilters.status??''}><option value="">Todas</option><option>pendiente</option><option>validada</option></select></label>
      </div>
      {!bank.length && <p>El banco aún está vacío.</p>}
      {bank.filter(q=>Object.entries(bankFilters).every(([k,v])=>!v||String(q[k])===v)).map(q=><div className="bank-row" key={q.id}><div><strong>{q.prompt}</strong><p>{name(q.topic)} · {q.status} · {q.active?'Activa':'Inactiva'} · Versión {q.version}</p></div><button disabled={busy} onClick={()=>{setQuestion(q);requestAnimationFrame(()=>document.querySelector('.editor textarea')?.focus())}}>Editar</button></div>)}
    </section>}
    {busy && <p role="status">Cargando…</p>}
  </>
}

createRoot(document.getElementById('root')).render(<App/>)
