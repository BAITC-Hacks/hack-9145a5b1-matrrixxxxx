const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

// Render the real static app without a browser. Browser QA separately covers layout,
// focus, native validation and the employee -> manager interaction.
function harness() {
  const listeners = {};
  const windowListeners = {};
  const elements = new Map();
  const makeElement = () => ({innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},querySelector(){return null;},addEventListener(){},focus(){},close(){this.open=false;},showModal(){this.open=true;}});
  const storage = new Map();
  const context = {console,crypto:webcrypto,URL,URLSearchParams,Blob,FormData,Date,Intl,setTimeout(){return 1;},clearTimeout(){},location:{hash:''},innerWidth:1440,scrollTo(){},addEventListener(name,callback){windowListeners[name]=callback;},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
  context.document={body:makeElement(),activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,makeElement());return elements.get(id);},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(name,callback){listeners[name]=callback;}};
  context.window=context;
  vm.createContext(context);
  const root=path.join(__dirname,'..','dist');
  vm.runInContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),context);
  let source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const end=source.lastIndexOf('})();');
  source=source.slice(0,end)+`window.testApi={db,calculateReadiness,promoteWaitlist,confirmEnrollment,catalogPage,activityEditor,render,setRole(role){session={role};},setView(value){view=value;}};`+source.slice(end);
  vm.runInContext(source,context);
  return {context,api:context.testApi,elements,listeners,windowListeners,storage};
}

test('all role surfaces and detail routes render a meaningful page',()=>{
  const {context,api,elements}=harness();
  const routes={employee:['/app/home','/app/development-plan','/app/catalog','/app/activities/ACT_SYSTEM_DESIGN_LAB','/app/enrollments','/app/enrollments/EN_DEMO_REVIEW','/app/navigator','/app/profile','/app/notifications','/app/settings','/app/settings/notifications','/app/settings/appearance','/app/settings/privacy','/help','/design-system','/welcome','/sign-in','/onboarding','/privacy','/accessibility'],manager:['/manager/team','/manager/team/E0028','/manager/reviews'],hr:['/hr/overview','/hr/people','/hr/people/E0028','/hr/activities','/hr/activities/new','/hr/activities/ACT_SYSTEM_DESIGN_LAB','/hr/analytics'],admin:['/admin/overview','/admin/users','/admin/skills','/admin/role-matrices','/admin/integrations','/admin/audit-log']};
  for(const [role,paths] of Object.entries(routes))for(const route of paths){api.setRole(role);context.location.hash='#'+route;assert.doesNotThrow(()=>api.render(),route);const html=elements.get('app').innerHTML;assert.match(html,/<h1/,route);assert.ok(!html.includes('Страница не найдена'),route);assert.ok(!html.includes('Этот раздел для другой роли'),route);}
});

test('role surface guards and unknown routes provide useful feedback',()=>{
  const {context,api,elements}=harness();api.setRole('employee');context.location.hash='#/admin/users';api.render();assert.match(elements.get('app').innerHTML,/Этот раздел для другой роли/);context.location.hash='#/missing';api.render();assert.match(elements.get('app').innerHTML,/Страница не найдена/);api.setRole('manager');context.location.hash='#/manager/team/E0114';api.render();assert.match(elements.get('app').innerHTML,/не входит в вашу команду/);
});

test('editable skill values are escaped in catalogue filter options',()=>{
  const {api}=harness();const payload='</option><img src=x onerror=alert(1)>';api.db.activities[0].skill=payload;const html=api.catalogPage();assert.ok(!html.includes(payload));assert.ok(html.includes('&lt;/option&gt;'));
});

test('activity editor retains every role in a multi-role audience',()=>{
  const {api}=harness();const html=api.activityEditor('ACT_PYTHON_LAB');assert.match(html,/name="audience" value="Backend Engineer" checked/);assert.match(html,/name="audience" value="Data Analyst" checked/);
});

test('readiness follows requirements and cannot exceed one hundred',()=>{
  const {api}=harness();const p=api.db.employees[0];assert.equal(api.calculateReadiness(p),68);p.skills.forEach(s=>s.target=1);assert.equal(api.calculateReadiness(p),100);p.skills.forEach(s=>s.target=5);assert.ok(api.calculateReadiness(p)<100);assert.equal(api.calculateReadiness({skills:[]}),0);
});

test('enrollment is idempotent and waitlist promotes FIFO when a place opens',()=>{
  const {api}=harness();api.setRole('employee');const a=api.db.activities[0];a.date=new Date(Date.now()+86400000).toISOString();api.confirmEnrollment(a.id);api.confirmEnrollment(a.id);assert.equal(api.db.enrollments.filter(e=>e.activityId===a.id).length,1);
  a.capacity=2;a.booked=1;const existing=api.db.enrollments.find(e=>e.activityId===a.id);existing.status='cancelled';api.db.enrollments.push({id:'wait-first',activityId:a.id,employeeId:'E0028',status:'waitlisted',createdAt:'2026-09-01'},{id:'wait-second',activityId:a.id,employeeId:'E0114',status:'waitlisted',createdAt:'2026-09-02'});api.promoteWaitlist(a.id);assert.equal(api.db.enrollments.find(e=>e.id==='wait-first').status,'enrolled');assert.equal(api.db.enrollments.find(e=>e.id==='wait-second').status,'waitlisted');assert.ok(api.db.notifications.some(n=>n.route==='/app/enrollments/wait-first'));
});

test('skip link focuses main without changing the SPA route',()=>{
  const {context,listeners,elements}=harness();context.location.hash='#/app/home';let prevented=false,focused=false;const main=elements.get('main')||{focus(){}};main.focus=()=>focused=true;elements.set('main',main);listeners.click({target:{closest:selector=>selector==='.skip-link'?{}:null},preventDefault(){prevented=true;}});assert.ok(prevented&&focused);assert.equal(context.location.hash,'#/app/home');
});

test('resizing restores desktop navigation without discarding the page',()=>{
  const {context,elements,windowListeners}=harness();const app=elements.get('app'),html=app.innerHTML;
  const sidebar={inert:false,classList:{remove(){}}},main={inert:false};
  app.querySelector=selector=>selector==='.sidebar'?sidebar:selector==='.main'?main:null;
  context.innerWidth=390;windowListeners.resize();assert.equal(sidebar.inert,true);assert.equal(main.inert,false);
  context.innerWidth=1440;windowListeners.resize();assert.equal(sidebar.inert,false);assert.equal(main.inert,false);assert.equal(app.innerHTML,html);
});
