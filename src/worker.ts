function createComplexStreets(gridSize: number, params: { numAgents: number; maxSteps: number; turnChance: number; branchChance: number; }) {
    let matrix = Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));
    let agents: { pos: { r: number, c: number }, dir: number, steps: number, active: boolean }[] = [];
    for (let i = 0; i < params.numAgents; i++) {
        agents.push({
            pos: { r: Math.floor(Math.random() * gridSize), c: Math.floor(Math.random() * gridSize) },
            dir: Math.floor(Math.random() * 4),
            steps: 0, active: true,
        });
    }
    let activeAgentsExist = true;
    while (activeAgentsExist) {
        activeAgentsExist = false;
        for (let agent of agents) {
            if (!agent.active) continue;
            activeAgentsExist = true;
            if (Math.random() < params.turnChance) agent.dir = Math.random() < 0.5 ? (agent.dir + 1) % 4 : (agent.dir + 3) % 4;
            if (Math.random() < params.branchChance && agent.steps > 0) agents.push({ pos: { ...agent.pos }, dir: Math.floor(Math.random() * 4), steps: 0, active: true });
            switch (agent.dir) {
                case 0: agent.pos.r--; break;
                case 1: agent.pos.c++; break;
                case 2: agent.pos.r++; break;
                case 3: agent.pos.c--; break;
            }
            agent.steps++;
            if (agent.pos.r < 0 || agent.pos.r >= gridSize || agent.pos.c < 0 || agent.pos.c >= gridSize || agent.steps >= params.maxSteps) {
                agent.active = false; continue;
            }
            if (matrix[agent.pos.r][agent.pos.c] === 1) {
                agent.active = false; continue;
            }
            matrix[agent.pos.r][agent.pos.c] = 1;
        }
    }
    return matrix;
}

function isStreet(r: number, c: number, gridSize: number, roadMatrix: number[][]) {
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) {
        return false;
    }
    return roadMatrix[r][c] === 1;
}

function generateCityData(gridSize: number, params: any, blockHeight: number, curbSize: number) {
    const roadMatrix = createComplexStreets(gridSize, params);

    const cityData = {
        ground: { size: gridSize * 3.0 },
        terrainBlocks: [] as any[],
        baseMeshes: [] as any[],
        curbPaths: [] as any[],
    };

    const cellSize = 3.0;

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if (roadMatrix[r][c] === 0) {
                const xPos = (c - gridSize / 2) * cellSize;
                const zPos = (r - gridSize / 2) * cellSize;

                // --- 1. Check neighbors for streets to determine corner shape ---
                const northStreet = isStreet(r - 1, c, gridSize, roadMatrix);
                const southStreet = isStreet(r + 1, c, gridSize, roadMatrix);
                const westStreet = isStreet(r, c - 1, gridSize, roadMatrix);
                const eastStreet = isStreet(r, c + 1, gridSize, roadMatrix);

                const roundNW = northStreet && westStreet;
                const roundNE = northStreet && eastStreet;
                const roundSW = southStreet && westStreet;
                const roundSE = southStreet && eastStreet;

                // --- 2. Create Shapes for Terrain, Pavement, and Curbs ---
                const halfCell = cellSize / 2;
                const cellCornerRadius = 0.5;

                const cellShapeCommands = [];
                // Start at SW corner
                cellShapeCommands.push({ cmd: 'moveTo', args: [-halfCell, -halfCell + (roundSW ? cellCornerRadius : 0)] });
                if (roundSW) cellShapeCommands.push({ cmd: 'quadraticCurveTo', args: [-halfCell, -halfCell, -halfCell + cellCornerRadius, -halfCell] });
                // Line to SE corner
                cellShapeCommands.push({ cmd: 'lineTo', args: [halfCell - (roundSE ? cellCornerRadius : 0), -halfCell] });
                if (roundSE) cellShapeCommands.push({ cmd: 'quadraticCurveTo', args: [halfCell, -halfCell, halfCell, -halfCell + cellCornerRadius] });
                // Line to NE corner
                cellShapeCommands.push({ cmd: 'lineTo', args: [halfCell, halfCell - (roundNE ? cellCornerRadius : 0)] });
                if (roundNE) cellShapeCommands.push({ cmd: 'quadraticCurveTo', args: [halfCell, halfCell, halfCell - cellCornerRadius, halfCell] });
                // Line to NW corner
                cellShapeCommands.push({ cmd: 'lineTo', args: [-halfCell + (roundNW ? cellCornerRadius : 0), halfCell] });
                if (roundNW) cellShapeCommands.push({ cmd: 'quadraticCurveTo', args: [-halfCell, halfCell, -halfCell, halfCell - cellCornerRadius] });
                // Close path back to SW corner
                cellShapeCommands.push({ cmd: 'closePath', args: [] });

                const blockSideLength = 1.0;
                const halfBlock = blockSideLength / 2;

                const terrainHoleCommands = [
                    { cmd: 'moveTo', args: [-halfBlock, -halfBlock] },
                    { cmd: 'lineTo', args: [halfBlock, -halfBlock] },
                    { cmd: 'lineTo', args: [halfBlock, halfBlock] },
                    { cmd: 'lineTo', args: [-halfBlock, halfBlock] },
                    { cmd: 'closePath', args: [] }
                ];

                cityData.baseMeshes.push({
                    shapeCmds: cellShapeCommands,
                    holeCmds: [terrainHoleCommands],
                    position: [xPos, 0, zPos],
                });

                cityData.terrainBlocks.push({
                    position: [xPos, 0, zPos],
                    height: blockHeight,
                });

                const hasAdjacentStreet = northStreet || southStreet || westStreet || eastStreet;
                if (hasAdjacentStreet) {
                    cityData.curbPaths.push({
                        position: [xPos, 0, zPos],
                        corners: { roundNW, roundNE, roundSW, roundSE },
                        north: northStreet,
                        south: southStreet,
                        east: eastStreet,
                        west: westStreet
                    });
                }
            }
        }
    }
    return cityData;
}


self.onmessage = (event) => {
    console.log("Worker received message:", event.data);
    const { params, blockHeight, curbSize } = event.data;
    const cityData = generateCityData(100, params, blockHeight, curbSize);
    self.postMessage(cityData);
};
