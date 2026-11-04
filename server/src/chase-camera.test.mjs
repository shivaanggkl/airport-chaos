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
    test(`${type}: elevated, lower-screen chase framing stays stable through pitch and bank`, () => {
        for (const aspect of [844 / 390, 1280 / 720]) {
            const airplane = new THREE.Group();
            airplane.add(new THREE.Mesh(new THREE.BoxGeometry(definition.wingSpan, definition.bodyRadius * 3, definition.bodyLength + definition.noseLength)));
            airplane.position.y = 1000;
            const camera = new THREE.PerspectiveCamera(58, aspect, .1, 10000);
            const state = { THREE, airplane, camera, currentAircraft: definition, CAMERA_CHASE_FOV: 58, CAMERA_TARGET_WIDTH_FRACTION: .305,
                cameraFramingKey: '', defaultChaseDistance: 0, defaultChaseHeight: 0, cameraFocusAhead: 1.5, smoothedChaseDistance: 0, cameraDistanceMultiplier: 1,
                currentSpeed: 0, boostActive: false, boostVisualStrength: 0, cameraOrbitRadiusTarget: 0, cameraOrbitDragging: false, cameraOrbitRecenterAt: null,
                cameraWorldUp: new THREE.Vector3(0, 1, 0), cameraFrameLocalBounds: new THREE.Box3(), cameraFrameMeshBounds: new THREE.Box3(),
                cameraFrameRootInverse: new THREE.Matrix4(), cameraFrameRelativeMatrix: new THREE.Matrix4(), groundPlaneY: () => 0 };
            for (const name of ['cameraFrameSize', 'cameraAircraftForward', 'cameraOrbitOffset', 'chaseCameraPosition', 'chaseLookTarget'])
                state[name] = new THREE.Vector3();
            for (const name of ['cameraOrbitYawQuaternion', 'cameraChaseQuaternion'])
                state[name] = new THREE.Quaternion();
            vm.createContext(state);
            vm.runInContext(ts.transpileModule(framing + chase, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
            let baseline;
            for (const [pitch, bank] of [[0, 0], [.3, .65], [-.28, -.65]]) {
                airplane.rotation.set(pitch, .5, bank, 'YXZ');
                state.updateCamera(1);
                const offset = state.chaseCameraPosition.clone().sub(airplane.position);
                assert.ok(offset.y / Math.hypot(offset.x, offset.z) >= .32, 'camera sees the upper airframe');
                if (baseline)
                    assert.ok(offset.distanceTo(baseline) < .00001, 'bank and pitch cannot swing the camera around the tail');
                else
                    baseline = offset;
                camera.position.copy(state.chaseCameraPosition);
                camera.lookAt(state.chaseLookTarget);
                camera.updateMatrixWorld();
                const center = airplane.position.clone().project(camera);
                assert.ok(Math.abs(center.x) < .001);
                assert.ok(center.y < -.08 && center.y > -.65, `airframe sits below center without clipping: ${center.y}`);
                assert.ok(Number.isFinite(center.z) && center.z < 1);
            }
        }
    });
