// ─── GENERACIÓN PROGRAMÁTICA DEL DIAGRAMA ────────────────────────────────────
export function renderDiagramFromState(structure, state) {
  const ext   = structure.poolExterno || [];
  const lanes = structure.poolPrincipal.lanes || [];
  const N     = lanes.length;
  const EH    = 160, EG = 20;
  const X0    = 150, DX = 160;
  const BRANCH_GAP = 110; // > altura de tarea (80) para que las ramas no se solapen

  // diagramState.steps ya está en orden cronológico global.
  const steps  = state.steps || [];
  const starts = steps.filter(s => s.tipo === 'startEvent');
  const ends   = steps.filter(s => s.tipo === 'endEvent');
  const mains  = steps.filter(s => s.tipo !== 'startEvent' && s.tipo !== 'endEvent');

  // Altura de lane: si hay gateways con ramas, dejar sitio para el abanico vertical
  const maxBranches = Math.max(1, ...mains.filter(m => m.branches?.length).map(m => m.branches.length));
  const LH = Math.max(180, maxBranches * BRANCH_GAP + 110);

  // Posiciones X: recorrido secuencial. Las ramas de un gateway se dibujan en
  // paralelo (mismo rango X, desplazamiento vertical _yOffset por rama) y
  // convergen, si procede, en el gateway de unión (join).
  starts.forEach(s => { s._x = X0; s._yOffset = 0; });
  let cursorX = X0 + DX;
  const branchExtras = []; // pasos dentro de ramas + joins (para shapes/refs)
  mains.forEach(step => {
    step._yOffset = 0;
    if ((step.tipo === 'exclusiveGateway' || step.tipo === 'parallelGateway' || step.tipo === 'inclusiveGateway') && step.branches?.length) {
      step._x = cursorX; cursorX += DX;
      let maxLen = 0;
      step.branches.forEach((branch, bi) => {
        const yOff = (bi - (step.branches.length - 1) / 2) * BRANCH_GAP;
        (branch.steps || []).forEach((bstep, j) => {
          bstep._x = cursorX + j * DX; bstep._yOffset = yOff;
          branchExtras.push(bstep);
        });
        maxLen = Math.max(maxLen, (branch.steps || []).length);
      });
      cursorX += Math.max(maxLen, 1) * DX;
      if (step.join) {
        step.join._x = cursorX; step.join._yOffset = 0;
        branchExtras.push(step.join);
        cursorX += DX;
      }
    } else {
      step._x = cursorX; cursorX += DX;
    }
  });
  const endX = cursorX;
  ends.forEach(s => { s._x = endX; s._yOffset = 0; });

  const ordered = [...starts, ...mains, ...branchExtras, ...ends];

  // Pool width: enough to fit all elements + margin
  const PW = Math.max(1200, endX + 300);

  const extY   = i => 30 + i * (EH + EG);
  const extCY  = i => extY(i) + EH / 2;
  const mainY  = ext.length > 0 ? 30 + ext.length * (EH + EG) : 30;
  const mainH  = Math.max(1, N) * LH;
  // Sin lanes (piscina única): los elementos se centran verticalmente en el pool
  const laneCY = j => N > 0 ? mainY + j * LH + LH / 2 : mainY + mainH / 2;

  // ── Collaboration ──────────────────────────────────────────────────────
  let col = '';
  ext.forEach((p, i) => {
    col += `    <participant id="Part_Ext${i+1}" name="${p.nombre}" processRef="Proc_Ext${i+1}"/>\n`;
  });
  col += `    <participant id="Part_Main" name="${structure.poolPrincipal.nombre}" processRef="Proc_Main"/>\n`;
  ordered.forEach(s => {
    if (s.participantIdx !== undefined) {
      col += `    <messageFlow id="MF_${s.id}" name="${s.nombre}" sourceRef="${s.id}" targetRef="Part_Ext${s.participantIdx+1}"/>\n`;
    }
    if (s.tipo === 'startEvent' && s.messageTrigger && s.fromParticipantIdx !== undefined) {
      col += `    <messageFlow id="MF_${s.id}_in" sourceRef="Part_Ext${s.fromParticipantIdx+1}" targetRef="${s.id}"/>\n`;
    }
  });

  // ── External processes ─────────────────────────────────────────────────
  let proc = '';
  ext.forEach((p, i) => { proc += `  <process id="Proc_Ext${i+1}" isExecutable="false"/>\n`; });

  // ── Lane sets ─────────────────────────────────────────────────────────
  let laneSetXml = '';
  lanes.forEach((lane, j) => {
    const refs = ordered.filter(t => t.laneIdx === j)
      .map(t => `        <flowNodeRef>${t.id}</flowNodeRef>`).join('\n');
    laneSetXml += `      <lane id="Lane${j+1}" name="${lane}">\n${refs ? refs+'\n' : ''}      </lane>\n`;
  });

  // ── Task / gateway / event elements ─────────────────────────────────────
  const taskXml = ordered.map(t => {
    const n = (t.nombre || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    if (t.tipo === 'startEvent')
      return `    <startEvent id="${t.id}" name="${n}">${t.messageTrigger ? `<messageEventDefinition id="MED_${t.id}"/>` : ''}</startEvent>`;
    if (t.tipo === 'endEvent')
      return t.messageTrigger
        ? `    <endEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></endEvent>`
        : `    <endEvent id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'exclusiveGateway') return `    <exclusiveGateway id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'parallelGateway')  return `    <parallelGateway  id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'inclusiveGateway') return `    <inclusiveGateway id="${t.id}" name="${n}"/>`;
    if (t.tipo === 'intermediateCatchEvent')
      return `    <intermediateCatchEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></intermediateCatchEvent>`;
    if (t.tipo === 'intermediateThrowEvent')
      return `    <intermediateThrowEvent id="${t.id}" name="${n}"><messageEventDefinition id="MED_${t.id}"/></intermediateThrowEvent>`;
    if (t.tipo === 'compensationEvent')
      return `    <intermediateThrowEvent id="${t.id}" name="${n}"><compensateEventDefinition id="CED_${t.id}"/></intermediateThrowEvent>`;
    if (t.tipo === 'timerEvent')
      return `    <intermediateCatchEvent id="${t.id}" name="${n}"><timerEventDefinition id="TED_${t.id}"/></intermediateCatchEvent>`;
    if (t.tipo === 'sendTask') return `    <sendTask id="${t.id}" name="${n}"/>`;
    return `    <task id="${t.id}" name="${n}"/>`;
  }).join('\n');

  // ── Sequence flows ──────────────────────────────────────────────────────
  // start(s) → pasos intermedios (con bifurcación/convergencia en gateways
  // con ramas) → fin(es). Cada entrada de chain es [src, tgt, name?].
  const escName = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const chain = [];
  if (mains.length > 0) {
    starts.forEach(s => chain.push([s.id, mains[0].id]));
    mains.forEach((m, i) => {
      const next = mains[i+1];
      if ((m.tipo === 'exclusiveGateway' || m.tipo === 'parallelGateway' || m.tipo === 'inclusiveGateway') && m.branches?.length) {
        m.branches.forEach(branch => {
          const bsteps = branch.steps || [];
          // En XOR/OR el flujo saliente lleva el nombre del caso (condición)
          const flowName = m.tipo !== 'parallelGateway' ? branch.nombre : '';
          if (bsteps.length > 0) {
            chain.push([m.id, bsteps[0].id, flowName]);
            for (let j = 0; j < bsteps.length - 1; j++) chain.push([bsteps[j].id, bsteps[j+1].id]);
            // Si la rama termina el proceso, su último paso ya es un endEvent: no sale nada de él
            if (!branch.endsHere && m.join) chain.push([bsteps[bsteps.length-1].id, m.join.id]);
          } else if (m.join) {
            chain.push([m.id, m.join.id, flowName]);
          }
        });
        if (m.join) {
          if (next) chain.push([m.join.id, next.id]);
          else ends.forEach(e => chain.push([m.join.id, e.id]));
        }
        // Sin join (todas las ramas terminan el proceso): no hay continuación.
      } else {
        if (next) chain.push([m.id, next.id]);
        else ends.forEach(e => chain.push([m.id, e.id]));
      }
    });
  } else {
    starts.forEach(s => ends.forEach(e => chain.push([s.id, e.id])));
  }
  const seqXml = chain.map(([src, tgt, name], i) =>
    `    <sequenceFlow id="SF_${i}" sourceRef="${src}" targetRef="${tgt}"${name ? ` name="${escName(name)}"` : ''}/>`
  ).join('\n');

  const laneSetBlock = N > 0 ? `    <laneSet id="LaneSet_1">\n${laneSetXml}    </laneSet>\n` : '';
  proc += `\n  <process id="Proc_Main" isExecutable="false">
${laneSetBlock}${taskXml ? taskXml+'\n' : ''}${seqXml ? seqXml+'\n' : ''}  </process>`;

  // ── DI shapes ─────────────────────────────────────────────────────────
  let shapes = '', edges = '';

  ext.forEach((p, i) => {
    shapes += `      <bpmndi:BPMNShape id="Shape_Part_Ext${i+1}" bpmnElement="Part_Ext${i+1}" isHorizontal="true">
        <dc:Bounds x="30" y="${extY(i)}" width="${PW}" height="${EH}"/>
      </bpmndi:BPMNShape>\n`;
  });
  shapes += `      <bpmndi:BPMNShape id="Shape_Part_Main" bpmnElement="Part_Main" isHorizontal="true">
        <dc:Bounds x="30" y="${mainY}" width="${PW}" height="${mainH}"/>
      </bpmndi:BPMNShape>\n`;
  lanes.forEach((_, j) => {
    shapes += `      <bpmndi:BPMNShape id="Shape_Lane${j+1}" bpmnElement="Lane${j+1}" isHorizontal="true">
        <dc:Bounds x="60" y="${mainY+j*LH}" width="${PW-30}" height="${LH}"/>
      </bpmndi:BPMNShape>\n`;
  });

  // Element shapes (size depends on tipo)
  const isGwTipo = t => t === 'exclusiveGateway' || t === 'parallelGateway' || t === 'inclusiveGateway';
  const isEvTipo = t => t === 'intermediateCatchEvent' || t === 'intermediateThrowEvent'
                     || t === 'compensationEvent' || t === 'timerEvent'
                     || t === 'startEvent' || t === 'endEvent';
  const shapeW = t => isGwTipo(t.tipo) ? 50 : isEvTipo(t.tipo) ? 36 : 100;
  const shapeH = t => isGwTipo(t.tipo) ? 50 : isEvTipo(t.tipo) ? 36 : 80;
  const elemCY = t => laneCY(t.laneIdx) + (t._yOffset || 0);

  ordered.forEach(t => {
    const w = shapeW(t), h = shapeH(t);
    shapes += `      <bpmndi:BPMNShape id="Shape_${t.id}" bpmnElement="${t.id}"${isGwTipo(t.tipo) ? ' isMarkerVisible="true"' : ''}>
        <dc:Bounds x="${t._x-w/2}" y="${elemCY(t)-h/2}" width="${w}" height="${h}"/>
      </bpmndi:BPMNShape>\n`;
  });

  // ── DI edges ──────────────────────────────────────────────────────────
  const elemOf = id => ordered.find(o => o.id === id);

  // Sequence flow edges: anclados a los bordes de las figuras. Si origen y
  // destino están a distinta altura:
  //  - bifurcación (origen = gateway): sale por arriba/abajo del rombo y entra
  //    horizontal en la rama, para que las flechas de las ramas no se solapen;
  //  - convergencia (destino = gateway/join): sale horizontal de la rama y
  //    entra por arriba/abajo del rombo de unión;
  //  - resto: ruta ortogonal con el tramo vertical a mitad de camino.
  chain.forEach(([src, tgt], i) => {
    const s = elemOf(src), t = elemOf(tgt);
    if (!s || !t) return;
    const sy = elemCY(s), ty = elemCY(t);
    let wps;
    if (Math.abs(sy - ty) < 1) {
      wps = [[s._x + shapeW(s) / 2, sy], [t._x - shapeW(t) / 2, ty]];
    } else if (isGwTipo(s.tipo)) {
      const gy = sy + (ty > sy ? shapeH(s) / 2 : -shapeH(s) / 2);
      wps = [[s._x, gy], [s._x, ty], [t._x - shapeW(t) / 2, ty]];
    } else if (isGwTipo(t.tipo)) {
      const gy = ty + (sy > ty ? shapeH(t) / 2 : -shapeH(t) / 2);
      wps = [[s._x + shapeW(s) / 2, sy], [t._x, sy], [t._x, gy]];
    } else {
      const sx = s._x + shapeW(s) / 2, tx = t._x - shapeW(t) / 2;
      wps = [[sx, sy], [(sx + tx) / 2, sy], [(sx + tx) / 2, ty], [tx, ty]];
    }
    edges += `      <bpmndi:BPMNEdge id="Edge_SF_${i}" bpmnElement="SF_${i}">
${wps.map(([x, y]) => `        <di:waypoint x="${x}" y="${y}"/>`).join('\n')}
      </bpmndi:BPMNEdge>\n`;
  });

  // Message flow edges: salientes (sendTask/throw → actor externo), incluidos pasos de ramas
  ordered.filter(t => t.participantIdx !== undefined).forEach(t => {
    const srcY = elemCY(t) - shapeH(t) / 2; // borde superior
    edges += `      <bpmndi:BPMNEdge id="Edge_MF_${t.id}" bpmnElement="MF_${t.id}">
        <di:waypoint x="${t._x}" y="${srcY}"/>
        <di:waypoint x="${t._x}" y="${extCY(t.participantIdx)}"/>
      </bpmndi:BPMNEdge>\n`;
  });

  // Message flow edges: entrantes (actor externo → startEvent con disparador de mensaje)
  starts.filter(s => s.messageTrigger && s.fromParticipantIdx !== undefined).forEach(s => {
    const tgtY = elemCY(s) - shapeH(s) / 2; // borde superior del evento de inicio
    edges += `      <bpmndi:BPMNEdge id="Edge_MF_${s.id}_in" bpmnElement="MF_${s.id}_in">
        <di:waypoint x="${s._x}" y="${extCY(s.fromParticipantIdx)}"/>
        <di:waypoint x="${s._x}" y="${tgtY}"/>
      </bpmndi:BPMNEdge>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <collaboration id="Collab_1">
${col}  </collaboration>
${proc}
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
${shapes}${edges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
}

// Alias para la estructura vacía inicial (sin pasos aún)
export function buildStructureBPMN(structure) {
  return renderDiagramFromState(structure, { steps: [] });
}
