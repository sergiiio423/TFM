const API_KEY = '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';

const STRUCTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <collaboration id="Collab_1">
    <participant id="Part_Ext1" name="Cliente" processRef="Proc_Ext1"/>
    <participant id="Part_Ext2" name="Pasarela de Pago" processRef="Proc_Ext2"/>
    <participant id="Part_Ext3" name="Mensajería" processRef="Proc_Ext3"/>
    <participant id="Part_Main" name="Servicio de Catering" processRef="Proc_Main"/>
  </collaboration>
  <process id="Proc_Ext1" isExecutable="false"/>
  <process id="Proc_Ext2" isExecutable="false"/>
  <process id="Proc_Ext3" isExecutable="false"/>
  <process id="Proc_Main" isExecutable="false">
    <laneSet id="LaneSet_1">
      <lane id="Lane1" name="Dpto Comercial"/>
      <lane id="Lane2" name="Dpto Envíos"/>
      <lane id="Lane3" name="Cocina"/>
      <lane id="Lane4" name="Almacén"/>
    </laneSet>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="Shape_Part_Ext1" bpmnElement="Part_Ext1" isHorizontal="true"><dc:Bounds x="30" y="30" width="1600" height="160"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Part_Ext2" bpmnElement="Part_Ext2" isHorizontal="true"><dc:Bounds x="30" y="210" width="1600" height="160"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Part_Ext3" bpmnElement="Part_Ext3" isHorizontal="true"><dc:Bounds x="30" y="390" width="1600" height="160"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Part_Main" bpmnElement="Part_Main" isHorizontal="true"><dc:Bounds x="30" y="570" width="1600" height="780"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Lane1" bpmnElement="Lane1" isHorizontal="true"><dc:Bounds x="60" y="630" width="1570" height="180"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Lane2" bpmnElement="Lane2" isHorizontal="true"><dc:Bounds x="60" y="810" width="1570" height="180"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Lane3" bpmnElement="Lane3" isHorizontal="true"><dc:Bounds x="60" y="990" width="1570" height="180"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Lane4" bpmnElement="Lane4" isHorizontal="true"><dc:Bounds x="60" y="1170" width="1570" height="180"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

const SYSTEM = `Eres un experto BPMN 2.0 especializado en e-commerce. Devuelve SOLO XML válido, sin texto ni markdown.

TIPOS DISPONIBLES:
  <startEvent id="SE1" name="Inicio"/>
  <startEvent id="SE1" name="Pedido recibido"><messageEventDefinition/></startEvent>
  <endEvent id="EE1" name="Fin"/>
  <endEvent id="EE1" name="Fin con msg"><messageEventDefinition/></endEvent>
  <userTask id="T1" name="Gestionar pedido"/>
  <serviceTask id="T1" name="Validar pago"/>
  <sendTask id="T1" name="Enviar confirmación"/>
  <exclusiveGateway id="GW1" name="¿Tipo alimento?"/>
  <boundaryEvent id="BE1" attachedToRef="T1"><timerEventDefinition/></boundaryEvent>

COORDENADAS para elementos NUEVOS:
  Lane1 (Dpto Comercial) y_centro=720:  tasks y=680 h=80, events y=702 h=36, gw y=695 h=50
  Lane2 (Dpto Envíos)    y_centro=900:  tasks y=860, events y=882, gw y=875
  Lane3 (Cocina)         y_centro=1080: tasks y=1040, events y=1062, gw y=1055
  Lane4 (Almacén)        y_centro=1260: tasks y=1220, events y=1242, gw y=1235
  Pool Cliente   y_centro=110, Pool Pasarela y_centro=290, Pool Mensajería y_centro=470
  X inicial: 150, incremento entre elementos: 160, tasks w=100, events w=36, gw w=50

REGLAS CRÍTICAS:
1. Todos los flowNode de Proc_Main → dentro de su <lane><flowNodeRef>id</flowNodeRef></lane>
2. Cada elemento → su BPMNShape con coordenadas
3. Cada sequenceFlow y messageFlow → BPMNEdge con >=2 waypoints
4. NO dupliques los BPMNShape de pools/lanes que ya existen en el XML base
5. BoundaryEvent: NO en flowNodeRef; su BPMNShape lleva isHorizontal="false"
6. Respuesta: empieza con <?xml termina con </definitions>`;

const USER = `Tienes la estructura BPMN ya configurada. AÑADE los elementos del proceso dentro de ella sin modificar pools ni lanes.

ESTRUCTURA BASE (no tocar los pools/lanes):
${STRUCTURE_XML}

PROCESO: Catering online. El cliente selecciona alimentos y confirma pedido (perfil, hora entrega, dirección, tarjeta). El Dpto Comercial recibe el pedido y solicita pago a la pasarela. Si pago OK: envía email de confirmación al cliente. Según tipo de alimento: fríos los prepara el Almacén, calientes los cocina la Cocina 1,5h antes. El Dpto Envíos coordina con Mensajería la entrega. Al día siguiente Dpto Comercial envía cuestionario de calidad al cliente.

ENTREGAS CONFIRMADAS (crea sendTask + messageFlow para cada una):
- Cliente recibe: "Email confirmación pedido", "Cuestionario de calidad"
- Pasarela de Pago recibe: "Solicitud de cobro"
- Mensajería recibe: "Instrucciones de entrega"

INSTRUCCIONES:
1. startEvent con messageEventDefinition en Lane1 (x=150)
2. Gateway exclusivo para tipo alimento: fríos→Lane4, calientes→Lane3
3. sendTask para cada entrega con messageFlow al pool externo
4. endEvent al final
5. Añade BPMNShape y BPMNEdge para TODOS los elementos nuevos
6. Solo XML válido`;

async function call(system, userMsg) {
  const r = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      temperature: 0.2,
      max_tokens: 4096
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d.error));
  return d.choices[0].message.content.trim();
}

const rawXML = await call(SYSTEM, USER);
let xml = rawXML.replace(/```xml/gi,'').replace(/```/g,'').trim();
const idx = xml.indexOf('<?xml'); if (idx > -1) xml = xml.substring(idx);
if (!xml.includes('</definitions>')) xml += '\n</definitions>';

const checks = {
  'Sección DI (bpmndi)':      xml.includes('bpmndi:BPMNDiagram'),
  'Pool Cliente preservado':   xml.includes('Part_Ext1'),
  'Pool Pasarela preservado':  xml.includes('Part_Ext2'),
  'Pool Mensajería preservado':xml.includes('Part_Ext3'),
  'Lane1 preservado':          xml.includes('Lane1'),
  'Lane4 preservado':          xml.includes('Lane4'),
  'Tiene sendTask':            xml.includes('<sendTask'),
  'Tiene messageFlow':         xml.includes('<messageFlow'),
  'Tiene exclusiveGateway':    xml.includes('exclusiveGateway'),
  'Tiene startEvent':          xml.includes('<startEvent'),
  'Tiene endEvent':            xml.includes('<endEvent'),
};

console.log('=== RESULTADO ===');
Object.entries(checks).forEach(([k,v]) => console.log((v ? '✅' : '❌') + ' ' + k));
console.log('\nTamaño XML:', xml.length, 'chars');

const types = ['userTask','serviceTask','sendTask','receiveTask','exclusiveGateway','startEvent','endEvent','messageFlow','sequenceFlow'];
types.forEach(t => {
  const count = (xml.match(new RegExp('<' + t + '[ >]','g')) || []).length;
  if (count > 0) console.log('  ' + t + ': ' + count);
});

import { writeFileSync } from 'fs';
writeFileSync('C:/Users/USUARIO/Documents/Sergio/Master/TFM/catering_test.bpmn', xml);
console.log('\nXML guardado en catering_test.bpmn');
