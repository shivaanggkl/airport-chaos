import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const framing = source.slice(source.indexOf('function refreshCameraFraming()'), source.indexOf('function updateCamera('));
const chase = source.slice(source.indexOf('function updateCamera('), source.indexOf('  if (cameraOrbitBlend > 0) {', source.indexOf('function updateCamera('))) + '\n}';
for (const [type, definition] of Object.entries(aircraftDefinitions))
    test(`${type}: chase view follows restrained pitch without inheriting bank`, () => {
        for (const aspect of [844 / 390, 1280 / 720]) {
            const airplane = new THREE.Group();
            airplane.add(new THREE.Mesh(new THREE.BoxGeometry(definition.wingSpan, definition.bodyRadius * 3, definition.bodyLength + definition.noseLength)));
            airplane.position.y = 1000;
            const camera = new THREE.PerspectiveCamera(58, aspect, .1, 10000);
            const state = { THREE, airplane, camera, currentAircraft: definition, CAMERA_CHASE_FOV: 58, CAMERA_TARGET_WIDTH_FRACTION: .305,
                cameraFramingKey: '', defaultChaseDistance: 0, defaultChaseHeight: 0, cameraFocusAhead: 1.5, smoothedChaseDistance: 0, cameraDistanceMultiplier: 1,
                currentSpeed: 0, boostActive: false, boostVisualStrength: 0, cameraOrbitRadiusTarget: 0, cameraOrbitDragging: false, cameraOrbitRecenterAt: null,
                cameraWorldUp: new THREE.Vector3(0, 1, 0),cameraPitchAxis:new THREE.Vector3(1,0,0), cameraFrameLocalBounds: new THREE.Box3(), cameraFrameMeshBounds: new THREE.Box3(),
                cameraFrameRootInverse: new THREE.Matrix4(), cameraFrameRelativeMatrix: new THREE.Matrix4(), groundPlaneY: () => 0 };
            for (const name of ['cameraFrameSize', 'cameraAircraftForward', 'cameraOrbitOffset', 'chaseCameraPosition', 'chaseLookTarget'])
                state[name] = new THREE.Vector3();
            for (const name of ['cameraOrbitYawQuaternion', 'cameraChaseQuaternion','cameraChasePitchQuaternion'])
                state[name] = new THREE.Quaternion();
            vm.createContext(state);
            vm.runInContext(ts.transpileModule(framing + chase, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
            for (const boosted of [false, true]) {
            state.currentSpeed = definition.maxSpeed * (boosted ? definition.boostMaxSpeed : 1);
            state.boostActive = boosted;
            state.boostVisualStrength = boosted ? 1 : 0;
            const offsets=new Map(),looks=new Map();
            for (const [pitch, bank] of [[0,0],[0,.65],[0,-.65],[.3,0],[.3,.65],[-.28,0],[-.28,-.65]]) {
                airplane.rotation.set(pitch, .5, bank, 'YXZ');
                state.updateCamera(1);
                const offset = state.chaseCameraPosition.clone().sub(airplane.position);
                const elevation = offset.y / Math.hypot(offset.x, offset.z);
                assert.ok(Number.isFinite(elevation));
                const localOffset=offset.clone().applyQuaternion(state.cameraChaseQuaternion.clone().invert());
                const oldHeight=state.defaultChaseHeight + (7.2+(boosted?2.35:0))*.05;
                assert(Math.abs(localOffset.y-oldHeight)<1e-5,'only the physical rear viewing height uses the older framing');
                const lookOffset = state.chaseLookTarget.clone().sub(airplane.position);
                if(looks.has(pitch))assert(lookOffset.distanceTo(looks.get(pitch))<1e-5,'bank cannot swing the aim');
                else looks.set(pitch,lookOffset);
                if(offsets.has(pitch))assert(offset.distanceTo(offsets.get(pitch))<1e-5,'bank cannot swing the camera');
                else offsets.set(pitch,offset);
                if(pitch!==0){assert(Math.sign(lookOffset.y-looks.get(0).y)===Math.sign(pitch),'aim must follow climb/descent');assert(Math.abs(offset.length()-offsets.get(0).length())<1e-5,'pitch cannot change chase distance');}
                camera.position.copy(state.chaseCameraPosition);
                camera.lookAt(state.chaseLookTarget);
                camera.updateMatrixWorld();
                const center = airplane.position.clone().project(camera);
                assert.ok(Math.abs(center.x) < .001);
                assert.ok(center.y < -.08 && center.y > -.65, `airframe sits below center without clipping: ${center.y}`);
                assert.ok(Number.isFinite(center.z) && center.z < 1);
            }
            }
        }
    });

test('manual orbit keeps its captured world heading while the aircraft turns',()=>{
    const start=source.indexOf('  if (cameraOrbitBlend > 0) {',source.indexOf('function updateCamera('));
    const block=source.slice(start,source.indexOf('  // Use absolute airspeed',start));
    const state={delta:1/60,cameraOrbitBlend:1,cameraOrbitRadius:25,cameraOrbitPitch:.2,cameraOrbitYaw:.8,airplane:new THREE.Group(),groundPlaneY:()=>-1000,
        cameraOrbitReferenceQuaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4),cameraOrbitYawQuaternion:new THREE.Quaternion()};
    for(const k of ['orbitCameraPosition','orbitLookTarget','cameraOrbitFocusLocal','targetCameraPosition','lookTarget','chaseCameraPosition','chaseLookTarget'])state[k]=new THREE.Vector3();
    vm.createContext(state);vm.runInContext(block,state);const first=state.targetCameraPosition.clone();
    state.airplane.rotation.y=1.8;state.cameraOrbitYawQuaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),1.8);
    vm.runInContext(block,state);assert(first.distanceTo(state.targetCameraPosition)<1e-9);
});

test('camera position and aim ease together, including manual look-around',()=>{
    const start=source.indexOf('    targetCameraRelativeOffset.copy(targetCameraPosition).sub(airplane.position);');
    const block=source.slice(start,source.indexOf('    camera.lookAt(lookTarget);',start)+ '    camera.lookAt(lookTarget);'.length);
    for(const dragging of [false,true]){
        const state={THREE,delta:1/60,cameraFollow:4.7,cameraOrbitDragging:dragging,cameraRelativeOffsetInitialized:true,airplane:new THREE.Group(),camera:new THREE.PerspectiveCamera(),targetCameraPosition:new THREE.Vector3(10,20,30),lookTarget:new THREE.Vector3(5,10,15),groundPlaneY:()=>-1000};
        for(const k of ['targetCameraRelativeOffset','targetCameraLookOffset','smoothedCameraRelativeOffset','smoothedCameraLookOffset'])state[k]=new THREE.Vector3();
        vm.createContext(state);vm.runInContext(ts.transpileModule(block,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,state);
        assert(state.camera.position.x>0&&state.camera.position.x<10,'no orbit snap');
        assert(Math.abs(state.camera.position.x/state.lookTarget.x-2)<1e-9,'aim and position share damping');
    }
});

test('city handoff rotates the chase damping and manual orbit reference with the flight frame',()=>{
    const start=source.indexOf('    const cameraRotation = new THREE.Quaternion().setFromAxisAngle(cameraWorldUp, yawDelta);');
    const block=source.slice(start,source.indexOf('    forward.set',start));
    const state={THREE,cameraWorldUp:new THREE.Vector3(0,1,0),yawDelta:.8,camera:new THREE.PerspectiveCamera(),lastValidCameraQuaternion:new THREE.Quaternion(),cameraOrbitReferenceQuaternion:new THREE.Quaternion(),smoothedCameraRelativeOffset:new THREE.Vector3(0,3,12),smoothedCameraLookOffset:new THREE.Vector3(0,1,-6)};
    vm.createContext(state);vm.runInContext(block,state);
    assert(state.smoothedCameraRelativeOffset.distanceTo(new THREE.Vector3(0,3,12).applyAxisAngle(state.cameraWorldUp,.8))<1e-9);
    assert(state.smoothedCameraLookOffset.distanceTo(new THREE.Vector3(0,1,-6).applyAxisAngle(state.cameraWorldUp,.8))<1e-9);
    assert(state.camera.quaternion.angleTo(state.cameraOrbitReferenceQuaternion)<1e-9);
});
