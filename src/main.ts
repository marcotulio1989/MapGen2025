import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- SCENE SETUP ---
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls;
const cityContainer = new THREE.Group();
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

// --- DOM Elements ---
const regenerateBtn = document.getElementById('regenerate-btn')!;
const depthSlider = document.getElementById('depth-slider') as HTMLInputElement;
const depthValueSpan = document.getElementById('depth-value')!;
const curbSizeSlider = document.getElementById('curb-size-slider') as HTMLInputElement;
const curbSizeValueSpan = document.getElementById('curb-size-value')!;
const loadingOverlay = document.getElementById('loading-overlay')!;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x22c55e); // Green grass color
    scene.fog = new THREE.Fog(0x22c55e, 100, 400);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(50, 80, 50);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(50, 100, 75);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // Expose to Playwright for verification
    (window as any).camera = camera;
    (window as any).controls = controls;
    (window as any).cityContainer = cityContainer;
    (window as any).THREE = THREE;
    (window as any).renderer = renderer;
    (window as any).scene = scene;
    (window as any).animate = animate;

    scene.add(cityContainer);

    worker.onmessage = (event) => {
        console.log("Main thread received message:", event.data);
        buildCityMeshes(event.data);
        loadingOverlay.style.display = 'none';
    };

    window.addEventListener('resize', onWindowResize);
    regenerateBtn.addEventListener('click', generateNewMap);
    depthSlider.addEventListener('input', () => {
        depthValueSpan.textContent = parseFloat(depthSlider.value).toFixed(2);
        generateNewMap();
    });
    curbSizeSlider.addEventListener('input', () => {
        curbSizeValueSpan.textContent = parseFloat(curbSizeSlider.value).toFixed(2);
        generateNewMap();
    });

    animate();
}

function buildCityMeshes(cityData: any) {
    if (!cityData) return;

    // Clear existing city
    while(cityContainer.children.length > 0){
        cityContainer.remove(cityContainer.children[0]);
    }

    const { ground: groundData, terrainBlocks, baseMeshes, curbPaths } = cityData;

    // --- Materials ---
    const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x166534 });
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af });
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x374151 });

    // --- Build Ground ---
    const groundGeometry = new THREE.PlaneGeometry(groundData.size, groundData.size);
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    cityContainer.add(ground);

    // --- Build Terrain Blocks ---
    terrainBlocks.forEach((block: any) => {
        const terrainShape = new THREE.Shape();
        const halfBlock = 1.0 / 2;
        terrainShape.moveTo(-halfBlock, -halfBlock);
        terrainShape.lineTo(halfBlock, -halfBlock);
        terrainShape.lineTo(halfBlock, halfBlock);
        terrainShape.lineTo(-halfBlock, halfBlock);
        terrainShape.closePath();

        const terrainExtrudeSettings = { depth: block.height, bevelEnabled: false };
        const terrainGeometry = new THREE.ExtrudeGeometry(terrainShape, terrainExtrudeSettings);
        const terrain = new THREE.Mesh(terrainGeometry, blockMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.set(block.position[0], 0, block.position[2]);
        terrain.castShadow = true;
        terrain.receiveShadow = true;
        cityContainer.add(terrain);
    });


    // --- Build Base Meshes (the green filler) ---
    baseMeshes.forEach((base: any) => {
        const shape = new THREE.Shape();
        base.shapeCmds.forEach((cmd: any) => {
            (shape as any)[cmd.cmd](...cmd.args);
        });

        base.holeCmds.forEach((hole: any) => {
            const holePath = new THREE.Path();
            hole.forEach((cmd: any) => {
                (holePath as any)[cmd.cmd](...cmd.args);
            });
            shape.holes.push(holePath);
        });

        const baseExtrudeSettings = { depth: 0.01, bevelEnabled: false };
        const baseGeometry = new THREE.ExtrudeGeometry(shape, baseExtrudeSettings);
        const baseMesh = new THREE.Mesh(baseGeometry, blockMaterial);
        baseMesh.rotation.x = -Math.PI / 2;
        baseMesh.position.set(base.position[0], 0, base.position[2]);
        baseMesh.receiveShadow = true;
        cityContainer.add(baseMesh);
    });

    // --- Build Curbs ---
    const curbSize = parseFloat(curbSizeSlider.value);
    const cellSize = 3.0;
    const halfCell = cellSize / 2;
    const cellCornerRadius = 0.5;

    const createCurb = (pathPoints: THREE.Vector2[], xPos: number, zPos: number) => {
        if (pathPoints.length < 2) return;

        const segmentLength = 0.5;
        const gap = 0.01;
        const curbHeight = 0.05;

        const segmentGeometry = new THREE.BoxGeometry(segmentLength - gap, curbHeight, curbSize);

        let distanceTraveled = 0;
        for (let i = 0; i < pathPoints.length - 1; i++) {
            const p1 = pathPoints[i];
            const p2 = pathPoints[i + 1];

            const segmentVector = new THREE.Vector2().subVectors(p2, p1);
            const segmentDist = segmentVector.length();
            if (segmentDist < 0.001) continue;

            const segmentDirection = segmentVector.normalize();
            const angle = Math.atan2(segmentDirection.y, segmentDirection.x);

            const startOffset = distanceTraveled > 0 ? segmentLength - distanceTraveled : 0;

            for (let d = startOffset; d < segmentDist; d += segmentLength) {
                const segmentCenterDist = d + (segmentLength / 2);
                if (segmentCenterDist > segmentDist) continue;

                const lerpFactor = segmentCenterDist / segmentDist;
                const position2D = new THREE.Vector2().lerpVectors(p1, p2, lerpFactor);

                const curbMesh = new THREE.Mesh(segmentGeometry, curbMaterial);

                const normal = new THREE.Vector2(segmentDirection.y, -segmentDirection.x);
                const offset = normal.multiplyScalar(curbSize / 2);

                curbMesh.position.set(
                    xPos + position2D.x + offset.x,
                    curbHeight / 2,
                    zPos + position2D.y + offset.y
                );

                curbMesh.rotation.y = -angle;

                curbMesh.castShadow = true;
                curbMesh.receiveShadow = true;
                cityContainer.add(curbMesh);
            }

            distanceTraveled = (distanceTraveled + segmentDist) % segmentLength;
        }
    };

    curbPaths.forEach((curb: any) => {
        const { position, corners, north, south, east, west } = curb;
        const xPos = position[0];
        const zPos = position[2];
        const { roundNW, roundNE, roundSW, roundSE } = corners;

        // Recreate the cell shape to get the points
        const cellShape = new THREE.Shape();
        cellShape.moveTo(-halfCell, -halfCell + (roundSW ? cellCornerRadius : 0));
        if (roundSW) cellShape.quadraticCurveTo(-halfCell, -halfCell, -halfCell + cellCornerRadius, -halfCell);
        cellShape.lineTo(halfCell - (roundSE ? cellCornerRadius : 0), -halfCell);
        if (roundSE) cellShape.quadraticCurveTo(halfCell, -halfCell, halfCell, -halfCell + cellCornerRadius);
        cellShape.lineTo(halfCell, halfCell - (roundNE ? cellCornerRadius : 0));
        if (roundNE) cellShape.quadraticCurveTo(halfCell, halfCell, halfCell - cellCornerRadius, halfCell);
        cellShape.lineTo(-halfCell + (roundNW ? cellCornerRadius : 0), halfCell);
        if (roundNW) cellShape.quadraticCurveTo(-halfCell, halfCell, -halfCell, halfCell - cellCornerRadius);
        cellShape.closePath();

        const allPoints = cellShape.getPoints(100);

        const findCornerIndex = (points: THREE.Vector2[], cornerX: number, cornerY: number) => {
            let bestIndex = -1;
            let minSqDist = Infinity;
            points.forEach((p: any, i: number) => {
                const sqDist = p.distanceToSquared(new THREE.Vector2(cornerX, cornerY));
                if (sqDist < minSqDist) {
                    minSqDist = sqDist;
                    bestIndex = i;
                }
            });
            return bestIndex;
        };

        const ne_idx = findCornerIndex(allPoints, halfCell, halfCell);
        const nw_idx = findCornerIndex(allPoints, -halfCell, halfCell);
        const sw_idx = findCornerIndex(allPoints, -halfCell, -halfCell);
        const se_idx = findCornerIndex(allPoints, halfCell, -halfCell);

        const getPath = (points: THREE.Vector2[], startIdx: number, endIdx: number) => {
            const path = [];
            if (startIdx === -1 || endIdx === -1) return path;
            let currentIndex = startIdx;
            const numPoints = points.length;
            while (currentIndex !== endIdx) {
                path.push(points[currentIndex]);
                currentIndex = (currentIndex + 1) % numPoints;
            }
            path.push(points[endIdx]);
            return path;
        };

        if (south) createCurb(getPath(allPoints, sw_idx, se_idx), xPos, zPos);
        if (east) createCurb(getPath(allPoints, se_idx, ne_idx), xPos, zPos);
        if (north) createCurb(getPath(allPoints, ne_idx, nw_idx), xPos, zPos);
        if (west) createCurb(getPath(allPoints, nw_idx, sw_idx), xPos, zPos);
    });
}

function generateNewMap() {
    loadingOverlay.style.display = 'flex';

    const params = {
        numAgents: Math.floor(Math.random() * 10) + 15,
        maxSteps: Math.floor(Math.random() * 300) + 200,
        turnChance: Math.random() * 0.2 + 0.1,
        branchChance: Math.random() * 0.05 + 0.01,
    };

    const blockHeight = parseFloat(depthSlider.value);
    const curbSize = parseFloat(curbSizeSlider.value);

    worker.postMessage({ params, blockHeight, curbSize });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();
generateNewMap();
