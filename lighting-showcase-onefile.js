/*
  Lighting Showcase - single-file JavaScript port
  Converted from the uploaded C# WinForms raytracer project.

  How to use:
    1. Create a blank HTML file with: <script src="lighting-showcase-onefile.js"></script>
    2. Open the HTML file in a browser.

  Features preserved:
    - CPU ray tracing into a 2D canvas
    - Built-in room/furniture scene
    - Direct lighting, emissive ceiling panel and lamp shade
    - Recursive BVH bounding boxes for triangle acceleration
    - Demo camera path and manual WASD/QE + mouse camera
    - Wavefront OBJ import, including optional MTL materials when selected together
*/
(() => {
  'use strict';

  const EPS = 1e-6;
  const DEMO_DURATION = 14.0;

  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    static zero() { return new Vec3(0, 0, 0); }
    add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
    mul(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
    div(s) { return new Vec3(this.x / s, this.y / s, this.z / s); }
    multiply(v) { return new Vec3(this.x * v.x, this.y * v.y, this.z * v.z); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v) { return new Vec3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
    length() { return Math.sqrt(this.dot(this)); }
    normalize() { const len = this.length(); return len < 1e-8 ? Vec3.zero() : this.div(len); }
    static lerp(a, b, t) { return new Vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
    static min(a, b) { return new Vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)); }
    static max(a, b) { return new Vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)); }
  }

  class Material {
    constructor(color, emission = 0, lightId = null) { this.color = color; this.emission = emission; this.lightId = lightId; }
  }

  class SceneMaterials {
    constructor() {
      this.whiteWall = new Material(new Vec3(0.78, 0.76, 0.72));
      this.redWall = new Material(new Vec3(0.75, 0.18, 0.14));
      this.blueWall = new Material(new Vec3(0.16, 0.28, 0.75));
      this.floor = new Material(new Vec3(0.55, 0.50, 0.43));
      this.ceiling = new Material(new Vec3(0.72, 0.72, 0.70));
      this.lightPanel = new Material(new Vec3(1.0, 0.92, 0.72), 2.2, 'ceiling');
      this.wood = new Material(new Vec3(0.46, 0.28, 0.13));
      this.darkWood = new Material(new Vec3(0.23, 0.13, 0.07));
      this.sofa = new Material(new Vec3(0.16, 0.38, 0.58));
      this.cushion = new Material(new Vec3(0.90, 0.72, 0.42));
      this.rug = new Material(new Vec3(0.55, 0.18, 0.22));
      this.plant = new Material(new Vec3(0.12, 0.50, 0.18));
      this.pot = new Material(new Vec3(0.50, 0.28, 0.16));
      this.lampGlow = new Material(new Vec3(1.0, 0.82, 0.48), 2.8, 'lamp');
      this.screenFrame = new Material(new Vec3(0.23, 0.13, 0.07));
      this.screen = new Material(new Vec3(0.08, 0.09, 0.11));
    }
  }

  class Ray {
    constructor(origin, direction) { this.origin = origin; this.direction = direction.normalize(); }
  }

  class Hit {
    constructor(t, point, normal, material) { this.t = t; this.point = point; this.normal = normal; this.material = material; }
  }

  class Aabb {
    constructor(min, max) { this.min = min; this.max = max; }
    intersect(ray, tMin, tMax) {
      const x = Aabb.hitAxis(ray.origin.x, ray.direction.x, this.min.x, this.max.x, tMin, tMax); if (!x.hit) return false;
      const y = Aabb.hitAxis(ray.origin.y, ray.direction.y, this.min.y, this.max.y, x.tMin, x.tMax); if (!y.hit) return false;
      const z = Aabb.hitAxis(ray.origin.z, ray.direction.z, this.min.z, this.max.z, y.tMin, y.tMax); return z.hit;
    }
    static hitAxis(origin, direction, min, max, tMin, tMax) {
      if (Math.abs(direction) < 1e-12) return { hit: origin >= min && origin <= max, tMin, tMax };
      let invD = 1.0 / direction;
      let t0 = (min - origin) * invD;
      let t1 = (max - origin) * invD;
      if (invD < 0.0) { const tmp = t0; t0 = t1; t1 = tmp; }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
      return { hit: tMax > tMin, tMin, tMax };
    }
    static around(triangle) {
      const pad = 1e-5;
      const min = new Vec3(
        Math.min(triangle.a.x, triangle.b.x, triangle.c.x) - pad,
        Math.min(triangle.a.y, triangle.b.y, triangle.c.y) - pad,
        Math.min(triangle.a.z, triangle.b.z, triangle.c.z) - pad
      );
      const max = new Vec3(
        Math.max(triangle.a.x, triangle.b.x, triangle.c.x) + pad,
        Math.max(triangle.a.y, triangle.b.y, triangle.c.y) + pad,
        Math.max(triangle.a.z, triangle.b.z, triangle.c.z) + pad
      );
      return new Aabb(min, max);
    }
    static surrounding(a, b) { return new Aabb(Vec3.min(a.min, b.min), Vec3.max(a.max, b.max)); }
  }

  class Triangle {
    constructor(a, b, c, material) {
      this.a = a; this.b = b; this.c = c; this.material = material;
      this.edge1 = b.sub(a); this.edge2 = c.sub(a);
      this.normal = this.edge1.cross(this.edge2).normalize();
      this.centroid = a.add(b).add(c).div(3.0);
      this.bounds = Aabb.around(this);
    }
    intersect(ray) {
      const h = ray.direction.cross(this.edge2);
      const det = this.edge1.dot(h);
      if (Math.abs(det) < EPS) return null;
      const invDet = 1.0 / det;
      const s = ray.origin.sub(this.a);
      const u = invDet * s.dot(h);
      if (u < 0.0 || u > 1.0) return null;
      const q = s.cross(this.edge1);
      const v = invDet * ray.direction.dot(q);
      if (v < 0.0 || u + v > 1.0) return null;
      const t = invDet * this.edge2.dot(q);
      if (t < EPS) return null;
      return new Hit(t, ray.origin.add(ray.direction.mul(t)), this.normal, this.material);
    }
  }

  class BvhNode {
    constructor(source, start, count) {
      this.left = null; this.right = null; this.triangles = null;
      this.bounds = BvhNode.computeBounds(source, start, count);
      if (count <= 4) {
        this.triangles = source.slice(start, start + count);
        return;
      }
      const axis = BvhNode.longestAxis(this.bounds);
      const slice = source.slice(start, start + count).sort((a, b) => BvhNode.centroidValue(a, axis) - BvhNode.centroidValue(b, axis));
      for (let i = 0; i < count; i++) source[start + i] = slice[i];
      const leftCount = Math.floor(count / 2);
      this.left = new BvhNode(source, start, leftCount);
      this.right = new BvhNode(source, start + leftCount, count - leftCount);
    }
    static build(triangles) { return triangles.length ? new BvhNode(triangles.slice(), 0, triangles.length) : null; }
    intersect(ray, tMin, tMax) {
      if (!this.bounds.intersect(ray, tMin, tMax)) return null;
      if (this.triangles) return this.intersectLeaf(ray, tMin, tMax);
      const leftHit = this.left ? this.left.intersect(ray, tMin, tMax) : null;
      const closest = leftHit ? leftHit.t : tMax;
      const rightHit = this.right ? this.right.intersect(ray, tMin, closest) : null;
      return rightHit || leftHit;
    }
    anyIntersection(ray, tMin, tMax) {
      if (!this.bounds.intersect(ray, tMin, tMax)) return false;
      if (this.triangles) {
        for (const tri of this.triangles) {
          const hit = tri.intersect(ray);
          if (hit && hit.t > tMin && hit.t < tMax) return true;
        }
        return false;
      }
      return (this.left && this.left.anyIntersection(ray, tMin, tMax)) || (this.right && this.right.anyIntersection(ray, tMin, tMax));
    }
    intersectLeaf(ray, tMin, tMax) {
      let closest = null;
      let closestSoFar = tMax;
      for (const tri of this.triangles) {
        const hit = tri.intersect(ray);
        if (hit && hit.t > tMin && hit.t < closestSoFar) { closestSoFar = hit.t; closest = hit; }
      }
      return closest;
    }
    static computeBounds(source, start, count) {
      let bounds = source[start].bounds;
      for (let i = 1; i < count; i++) bounds = Aabb.surrounding(bounds, source[start + i].bounds);
      return bounds;
    }
    static longestAxis(bounds) {
      const x = bounds.max.x - bounds.min.x, y = bounds.max.y - bounds.min.y, z = bounds.max.z - bounds.min.z;
      return x >= y && x >= z ? 0 : (y >= z ? 1 : 2);
    }
    static centroidValue(tri, axis) { return axis === 0 ? tri.centroid.x : axis === 1 ? tri.centroid.y : tri.centroid.z; }
  }

  class SceneLight {
    constructor(id, position, color, intensity) { this.id = id; this.position = position; this.color = color; this.intensity = intensity; }
  }

  class Scene {
    constructor() { this.triangles = []; this.lights = []; this.materials = new SceneMaterials(); this.bvhRoot = null; this.description = 'Built-in room'; }
    clear() { this.triangles = []; this.lights = []; this.bvhRoot = null; this.description = 'Empty scene'; }
    build() { this.clear(); new SceneBuilder(this, this.materials).build(); this.description = 'Built-in room'; this.rebuildAccelerationStructure(); }
    buildFromObjText(fileName, objText, mtlFilesByName = new Map()) {
      this.build();
      const result = ObjSceneLoader.loadIntoScene(this, fileName, objText, mtlFilesByName, this.materials.whiteWall);
      this.description = `OBJ: ${fileName} (${result.triangleCount} triangles)`;
      return result;
    }
    rebuildAccelerationStructure() { this.bvhRoot = BvhNode.build(this.triangles); }
    intersect(ray) {
      if (this.bvhRoot) return this.bvhRoot.intersect(ray, 1e-6, Number.POSITIVE_INFINITY);
      let closest = null;
      for (const tri of this.triangles) { const hit = tri.intersect(ray); if (hit && (!closest || hit.t < closest.t)) closest = hit; }
      return closest;
    }
    anyIntersection(ray, maxDistance) {
      if (this.bvhRoot) return this.bvhRoot.anyIntersection(ray, 1e-6, maxDistance);
      for (const tri of this.triangles) { const hit = tri.intersect(ray); if (hit && hit.t < maxDistance) return true; }
      return false;
    }
    quad(a, b, c, d, material) { this.triangles.push(new Triangle(a, b, c, material), new Triangle(a, c, d, material)); }
    box(min, max, material) {
      const x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x, y1 = max.y, z1 = max.z;
      const p000 = new Vec3(x0, y0, z0), p001 = new Vec3(x0, y0, z1), p010 = new Vec3(x0, y1, z0), p011 = new Vec3(x0, y1, z1);
      const p100 = new Vec3(x1, y0, z0), p101 = new Vec3(x1, y0, z1), p110 = new Vec3(x1, y1, z0), p111 = new Vec3(x1, y1, z1);
      this.quad(p001, p101, p111, p011, material); this.quad(p100, p000, p010, p110, material);
      this.quad(p000, p001, p011, p010, material); this.quad(p101, p100, p110, p111, material);
      this.quad(p010, p011, p111, p110, material); this.quad(p000, p100, p101, p001, material);
    }
  }

  class SceneBuilder {
    constructor(scene, materials) { this.scene = scene; this.m = materials; }
    build() {
      this.buildRoom(); this.buildFurniture();
      this.scene.lights.push(new SceneLight('ceiling', new Vec3(0.0, 1.88, 3.5), new Vec3(1.0, 0.94, 0.82), 3.5));
      this.scene.lights.push(new SceneLight('lamp', new Vec3(-2.12, 0.88, 4.02), new Vec3(1.0, 0.74, 0.42), 4.4));
    }
    buildRoom() {
      const x0 = -2.5, x1 = 2.5, y0 = -1.5, y1 = 2.0, z0 = 1.0, z1 = 6.0;
      this.scene.quad(new Vec3(x0, y0, z0), new Vec3(x1, y0, z0), new Vec3(x1, y0, z1), new Vec3(x0, y0, z1), this.m.floor);
      this.scene.quad(new Vec3(x0, y1, z1), new Vec3(x1, y1, z1), new Vec3(x1, y1, z0), new Vec3(x0, y1, z0), this.m.ceiling);
      this.scene.quad(new Vec3(x0, y0, z1), new Vec3(x1, y0, z1), new Vec3(x1, y1, z1), new Vec3(x0, y1, z1), this.m.whiteWall);
      this.scene.quad(new Vec3(x0, y0, z0), new Vec3(x0, y0, z1), new Vec3(x0, y1, z1), new Vec3(x0, y1, z0), this.m.redWall);
      this.scene.quad(new Vec3(x1, y0, z1), new Vec3(x1, y0, z0), new Vec3(x1, y1, z0), new Vec3(x1, y1, z1), this.m.blueWall);
      this.scene.quad(new Vec3(-0.65, 1.95, 3.0), new Vec3(0.65, 1.95, 3.0), new Vec3(0.65, 1.95, 4.0), new Vec3(-0.65, 1.95, 4.0), this.m.lightPanel);
    }
    buildFurniture() {
      this.scene.box(new Vec3(-1.65, -1.48, 3.45), new Vec3(1.65, -1.42, 4.85), this.m.rug);
      this.buildSofa(); this.buildTableAndCabinet(); this.buildPlantLampAndScreen();
    }
    buildSofa() {
      this.scene.box(new Vec3(-1.75, -1.15, 4.55), new Vec3(1.75, -0.70, 5.20), this.m.sofa);
      this.scene.box(new Vec3(-1.75, -0.70, 4.95), new Vec3(1.75, 0.20, 5.20), this.m.sofa);
      this.scene.box(new Vec3(-1.95, -1.15, 4.55), new Vec3(-1.70, -0.45, 5.20), this.m.sofa);
      this.scene.box(new Vec3(1.70, -1.15, 4.55), new Vec3(1.95, -0.45, 5.20), this.m.sofa);
      this.scene.box(new Vec3(-1.30, -0.65, 4.35), new Vec3(-0.35, -0.18, 4.55), this.m.cushion);
      this.scene.box(new Vec3(0.35, -0.65, 4.35), new Vec3(1.30, -0.18, 4.55), this.m.cushion);
    }
    buildTableAndCabinet() {
      this.scene.box(new Vec3(-0.75, -1.18, 2.75), new Vec3(0.75, -0.95, 3.55), this.m.wood);
      this.scene.box(new Vec3(-0.65, -1.50, 2.85), new Vec3(-0.50, -1.18, 3.00), this.m.darkWood);
      this.scene.box(new Vec3(0.50, -1.50, 2.85), new Vec3(0.65, -1.18, 3.00), this.m.darkWood);
      this.scene.box(new Vec3(-0.65, -1.50, 3.30), new Vec3(-0.50, -1.18, 3.45), this.m.darkWood);
      this.scene.box(new Vec3(0.50, -1.50, 3.30), new Vec3(0.65, -1.18, 3.45), this.m.darkWood);
      this.scene.box(new Vec3(-2.10, -1.50, 2.05), new Vec3(-1.40, -0.95, 2.45), this.m.wood);
      this.scene.box(new Vec3(-2.05, -0.95, 2.10), new Vec3(-1.45, -0.25, 2.40), this.m.wood);
    }
    buildPlantLampAndScreen() {
      this.scene.box(new Vec3(1.35, -1.50, 2.00), new Vec3(1.70, -0.25, 2.35), this.m.pot);
      this.scene.box(new Vec3(1.28, -0.25, 1.95), new Vec3(1.77, 0.10, 2.40), this.m.plant);
      this.scene.box(new Vec3(1.43, 0.05, 2.05), new Vec3(1.62, 0.65, 2.30), this.m.plant);
      this.scene.box(new Vec3(-2.20, -1.50, 3.95), new Vec3(-2.05, 0.65, 4.10), this.m.darkWood);
      this.scene.box(new Vec3(-2.35, 0.65, 3.75), new Vec3(-1.90, 1.05, 4.30), this.m.lampGlow);
      this.scene.box(new Vec3(-0.85, 0.35, 5.95), new Vec3(0.85, 1.15, 5.98), this.m.screenFrame);
      this.scene.box(new Vec3(-0.75, 0.45, 5.92), new Vec3(0.75, 1.05, 5.95), this.m.screen);
    }
  }

  class ObjSceneLoader {
    static loadIntoScene(scene, fileName, objText, mtlFilesByName, fallbackMaterial, targetSize = 2.15, targetCenter = new Vec3(0, 0, 3.45), floorY = -1.48) {
      const raw = ObjSceneLoader.parseObj(objText, mtlFilesByName, fallbackMaterial);
      if (!raw.vertices.length) throw new Error('OBJ file does not contain any vertices.');
      if (!raw.faces.length) throw new Error('OBJ file does not contain any faces.');
      let min = raw.vertices[0], max = raw.vertices[0];
      for (const v of raw.vertices) { min = Vec3.min(min, v); max = Vec3.max(max, v); }
      const size = max.sub(min); const largestAxis = Math.max(size.x, size.y, size.z);
      if (largestAxis < 1e-8) throw new Error('OBJ model bounds are degenerate.');
      const scale = targetSize / largestAxis;
      const sourceCenter = min.add(max).mul(0.5);
      const scaledMinY = (min.y - sourceCenter.y) * scale + targetCenter.y;
      const offset = new Vec3(targetCenter.x, targetCenter.y + (floorY - scaledMinY), targetCenter.z);
      let triangleCount = 0;
      for (const face of raw.faces) {
        if (face.indices.length < 3) continue;
        const material = face.materialName && raw.materials.has(face.materialName.toLowerCase()) ? raw.materials.get(face.materialName.toLowerCase()) : fallbackMaterial;
        const a = ObjSceneLoader.transform(raw.vertices[face.indices[0]], sourceCenter, scale, offset);
        for (let i = 1; i < face.indices.length - 1; i++) {
          const b = ObjSceneLoader.transform(raw.vertices[face.indices[i]], sourceCenter, scale, offset);
          const c = ObjSceneLoader.transform(raw.vertices[face.indices[i + 1]], sourceCenter, scale, offset);
          if (b.sub(a).cross(c.sub(a)).length() > 1e-10) { scene.triangles.push(new Triangle(a, b, c, material)); triangleCount++; }
        }
      }
      scene.rebuildAccelerationStructure();
      return { fileName, vertexCount: raw.vertices.length, faceCount: raw.faces.length, triangleCount };
    }
    static parseObj(text, mtlFilesByName, fallbackMaterial) {
      const raw = { vertices: [], faces: [], materials: new Map() };
      let activeMaterialName = null;
      for (const sourceLine of text.split(/\r?\n/)) {
        const line = ObjSceneLoader.stripComment(sourceLine).trim(); if (!line) continue;
        const parts = line.split(/\s+/); if (!parts.length) continue;
        if (parts[0] === 'v' && parts.length >= 4) raw.vertices.push(new Vec3(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])));
        else if (parts[0] === 'f' && parts.length >= 4) raw.faces.push({ indices: parts.slice(1).map(token => ObjSceneLoader.parseVertexIndex(token, raw.vertices.length)), materialName: activeMaterialName });
        else if (parts[0] === 'usemtl') activeMaterialName = parts.length >= 2 ? parts[1] : null;
        else if (parts[0] === 'mtllib') {
          for (const name of parts.slice(1)) {
            const mtlText = mtlFilesByName.get(name) || mtlFilesByName.get(name.split('/').pop()) || mtlFilesByName.get(name.toLowerCase());
            if (mtlText) ObjSceneLoader.loadMtl(raw.materials, mtlText, fallbackMaterial);
          }
        }
      }
      return raw;
    }
    static loadMtl(materials, text, fallbackMaterial) {
      let currentName = null;
      let currentColor = fallbackMaterial.color;
      let currentEmission = 0.0;
      const commit = () => { if (currentName && currentName.trim()) materials.set(currentName.toLowerCase(), new Material(currentColor, currentEmission)); };
      for (const sourceLine of text.split(/\r?\n/)) {
        const line = ObjSceneLoader.stripComment(sourceLine).trim(); if (!line) continue;
        const parts = line.split(/\s+/); if (!parts.length) continue;
        if (parts[0] === 'newmtl') { commit(); currentName = parts.length >= 2 ? parts[1] : null; currentColor = fallbackMaterial.color; currentEmission = 0.0; }
        else if (parts[0] === 'Kd' && parts.length >= 4) currentColor = new Vec3(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        else if (parts[0] === 'Ke' && parts.length >= 4) { currentColor = new Vec3(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])); currentEmission = Math.max(currentColor.x, currentColor.y, currentColor.z); }
      }
      commit();
    }
    static parseVertexIndex(token, vertexCount) {
      const objIndex = parseInt(token.split('/')[0], 10);
      if (!Number.isFinite(objIndex)) throw new Error(`Invalid OBJ face index: ${token}`);
      const zeroBased = objIndex > 0 ? objIndex - 1 : vertexCount + objIndex;
      if (zeroBased < 0 || zeroBased >= vertexCount) throw new Error(`OBJ face index out of range: ${token}`);
      return zeroBased;
    }
    static transform(value, sourceCenter, scale, offset) { return value.sub(sourceCenter).mul(scale).add(offset); }
    static stripComment(text) { const index = text.indexOf('#'); return index >= 0 ? text.slice(0, index) : text; }
  }

  class LightingState {
    constructor() { this.ceilingLevel = 0.5; this.lampLevel = 0.5; this.label = 'Medium mixed brightness'; }
    getLevel(id) { return id === 'ceiling' ? this.ceilingLevel : id === 'lamp' ? this.lampLevel : 1.0; }
    evaluate(timeSeconds, duration) {
      const t = ((timeSeconds % duration) + duration) % duration;
      if (t < 2.0) this.set(0.50, 0.50, 'Medium mixed brightness');
      else if (t < 4.0) this.set(0.0, 0.0, 'Lights off');
      else if (t < 7.0) this.set(smooth((t - 4.0) / 3.0), 0.0, 'Ceiling brightening');
      else if (t < 9.0) this.set(1.0, 0.0, 'Ceiling fully on');
      else if (t < 11.0) { const u = smooth((t - 9.0) / 2.0); this.set(mix(1.0, 0.25, u), mix(0.0, 1.0, u), 'Ceiling dimming, lamp brightening'); }
      else if (t < 13.0) { const u = smooth((t - 11.0) / 2.0); this.set(mix(0.25, 0.85, u), 1.0, 'Mixed lighting brightening'); }
      else this.set(0.50, 0.50, 'Return to medium brightness');
    }
    set(ceiling, lamp, label) { this.ceilingLevel = clamp01(ceiling); this.lampLevel = clamp01(lamp); this.label = label; }
  }

  class CameraController {
    constructor() { this.position = new Vec3(0.0, 0.55, -2.25); this.yaw = 0.0; this.pitch = -0.09; }
    reset() { this.position = new Vec3(0.0, 0.55, -2.25); this.yaw = 0.0; this.pitch = -0.09; }
    move(direction, amount) { this.position = this.position.add(direction.mul(amount)); }
    rotate(yawDelta, pitchDelta) { this.yaw += yawDelta; this.pitch = clamp(this.pitch + pitchDelta, -1.35, 1.35); }
    setLookAt(position, target) { this.position = position; const dir = target.sub(position).normalize(); this.yaw = Math.atan2(dir.x, dir.z); this.pitch = Math.asin(clamp(dir.y, -1.0, 1.0)); }
    getBasis() {
      let forward = new Vec3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
      const worldUp = new Vec3(0, 1, 0);
      const right = worldUp.cross(forward).normalize();
      const up = forward.cross(right).normalize();
      return { forward, right, up };
    }
  }

  class DemoCameraPath {
    constructor() {
      this.keys = [
        [0.00, new Vec3(0.00, 0.60, -2.20), new Vec3(0.00, -0.15, 3.25)],
        [0.14, new Vec3(-1.55, 0.70, 1.35), new Vec3(-0.10, -0.95, 3.00)],
        [0.28, new Vec3(-1.95, 0.95, 2.85), new Vec3(0.35, -0.90, 3.30)],
        [0.42, new Vec3(-0.45, 0.30, 2.15), new Vec3(0.15, -1.05, 3.10)],
        [0.56, new Vec3(1.50, 0.75, 2.15), new Vec3(0.25, -0.90, 4.15)],
        [0.70, new Vec3(1.55, 1.25, 4.45), new Vec3(-0.35, -0.35, 3.25)],
        [0.82, new Vec3(-1.55, 1.00, 4.80), new Vec3(-2.10, 0.70, 4.00)],
        [0.92, new Vec3(-0.20, 1.15, 5.15), new Vec3(0.00, -0.45, 3.25)],
        [1.00, new Vec3(0.00, 0.60, -2.20), new Vec3(0.00, -0.15, 3.25)]
      ];
    }
    sample(normalizedTime) {
      const t = ((normalizedTime % 1.0) + 1.0) % 1.0;
      for (let i = 0; i < this.keys.length - 1; i++) {
        const a = this.keys[i], b = this.keys[i + 1];
        if (t >= a[0] && t <= b[0]) {
          const local = smooth((t - a[0]) / (b[0] - a[0]));
          return { position: Vec3.lerp(a[1], b[1], local), target: Vec3.lerp(a[2], b[2], local) };
        }
      }
      return { position: this.keys[0][1], target: this.keys[0][2] };
    }
  }

  class RayTracer {
    constructor(scene, lighting) { this.scene = scene; this.lighting = lighting; }
    trace(ray) {
      const hit = this.scene.intersect(ray);
      if (!hit) return new Vec3(0.01, 0.012, 0.016);
      const lightBlend = this.lighting.ceilingLevel * 0.7 + this.lighting.lampLevel * 0.5;
      let color = hit.material.color.mul(0.015 + 0.055 * lightBlend);
      for (const light of this.scene.lights) color = color.add(this.directLight(hit, light));
      if (hit.material.emission > 0) {
        const scale = hit.material.lightId ? this.lighting.getLevel(hit.material.lightId) : 1.0;
        color = color.add(hit.material.color.mul(hit.material.emission * scale));
      }
      return color;
    }
    directLight(hit, light) {
      const level = this.lighting.getLevel(light.id);
      if (level <= 0.001) return Vec3.zero();
      const toLight = light.position.sub(hit.point);
      const distance = toLight.length();
      const lightDir = toLight.normalize();
      const shadow = this.isShadowed(hit, lightDir, distance) ? 0.18 : 1.0;
      const diffuse = Math.max(0.0, hit.normal.dot(lightDir));
      const attenuation = 1.0 / (1.0 + 0.11 * distance * distance);
      const strength = light.intensity * level * diffuse * attenuation * shadow;
      return hit.material.color.multiply(light.color).mul(strength);
    }
    isShadowed(hit, lightDir, distance) { return this.scene.anyIntersection(new Ray(hit.point.add(hit.normal.mul(0.002)), lightDir), distance); }
    static rayDirection(x, y, width, height, basis) {
      const aspect = width / height;
      const fov = Math.tan((72.0 * Math.PI / 180.0) / 2.0);
      const u = (2.0 * (x + 0.5) / width - 1.0) * aspect * fov;
      const v = (1.0 - 2.0 * (y + 0.5) / height) * fov;
      return basis.forward.add(basis.right.mul(u)).add(basis.up.mul(v)).normalize();
    }
  }

  class App {
    constructor(root = document.body) {
      this.root = root;
      this.scene = new Scene(); this.scene.build();
      this.lighting = new LightingState();
      this.camera = new CameraController();
      this.demoPath = new DemoCameraPath();
      this.tracer = new RayTracer(this.scene, this.lighting);
      this.keys = new Set();
      this.renderScale = 0.50;
      this.demoTime = 0.0;
      this.demoPlaying = true;
      this.useDemoCamera = true;
      this.dragging = false;
      this.lastMouseX = 0; this.lastMouseY = 0;
      this.lastLoadMessage = 'Drop or load a .obj file';
      this.previousTime = performance.now();
      this.buildUi();
      this.resize();
      this.installEvents();
      requestAnimationFrame(t => this.tick(t));
    }
    buildUi() {
      document.body.style.margin = '0'; document.body.style.background = '#000'; document.body.style.overflow = 'hidden';
      this.canvas = document.createElement('canvas');
      this.canvas.style.width = '100vw'; this.canvas.style.height = '100vh'; this.canvas.style.display = 'block'; this.canvas.style.imageRendering = 'pixelated';
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.panel = document.createElement('div');
      Object.assign(this.panel.style, { position: 'fixed', left: '14px', top: '14px', width: '390px', padding: '12px', color: 'white', background: 'rgba(0,0,0,0.62)', font: '13px system-ui, Segoe UI, sans-serif', borderRadius: '12px', lineHeight: '1.35', userSelect: 'none' });
      this.panel.innerHTML = `
        <div style="font-weight:700;font-size:15px;margin-bottom:8px">Lighting showcase - JavaScript raytracer</div>
        <div style="opacity:.9;margin-bottom:10px">Keys: WASD move, Q/E up/down, drag mouse to look, F play/pause, T restart, M manual, P demo, +/- scale.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <button data-action="play">Pause</button><button data-action="restart">Restart</button><button data-action="manual">Manual</button><button data-action="demo">Demo</button><button data-action="reset">Reset camera</button>
        </div>
        <label>Render scale <select data-action="scale"><option value="0.25">25%</option><option value="0.5" selected>50%</option><option value="0.75">75%</option><option value="1">100%</option></select></label>
        <label style="display:block;margin-top:8px">Load OBJ/MTL <input data-action="file" type="file" multiple accept=".obj,.mtl,text/plain" style="max-width:210px"></label>
        <div data-status style="white-space:pre-line;margin-top:10px;color:#e8e8e8"></div>`;
      for (const b of this.panel.querySelectorAll('button')) { b.style.cursor = 'pointer'; b.style.padding = '4px 8px'; }
      this.status = this.panel.querySelector('[data-status]');
      this.root.append(this.canvas, this.panel);
    }
    installEvents() {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('keydown', e => this.onKeyDown(e));
      window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
      this.canvas.addEventListener('mousedown', e => { this.useDemoCamera = false; this.dragging = true; this.lastMouseX = e.clientX; this.lastMouseY = e.clientY; });
      window.addEventListener('mouseup', () => { this.dragging = false; });
      window.addEventListener('mousemove', e => this.onMouseMove(e));
      this.panel.addEventListener('click', e => {
        const action = e.target && e.target.dataset ? e.target.dataset.action : null;
        if (action === 'play') this.demoPlaying = !this.demoPlaying;
        else if (action === 'restart') this.restartDemo();
        else if (action === 'manual') this.useDemoCamera = false;
        else if (action === 'demo') { this.useDemoCamera = true; this.setDemoCamera(); }
        else if (action === 'reset') { this.camera.reset(); this.useDemoCamera = false; }
      });
      this.panel.querySelector('[data-action="scale"]').addEventListener('change', e => { this.renderScale = parseFloat(e.target.value); this.resize(); });
      this.panel.querySelector('[data-action="file"]').addEventListener('change', e => this.loadFiles(e.target.files));
      window.addEventListener('dragover', e => { e.preventDefault(); });
      window.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) this.loadFiles(e.dataTransfer.files); });
    }
    resize() {
      const w = Math.max(1, Math.round(window.innerWidth * this.renderScale));
      const h = Math.max(1, Math.round(window.innerHeight * this.renderScale));
      this.canvas.width = w; this.canvas.height = h;
      this.imageData = this.ctx.createImageData(w, h);
    }
    tick(now) {
      const dt = Math.min(0.05, (now - this.previousTime) / 1000.0);
      this.previousTime = now;
      if (this.demoPlaying) this.updateDemo(dt);
      this.updateManualCamera(dt);
      this.renderFrame();
      this.updateStatus();
      requestAnimationFrame(t => this.tick(t));
    }
    updateDemo(dt) { this.demoTime = (this.demoTime + dt) % DEMO_DURATION; this.lighting.evaluate(this.demoTime, DEMO_DURATION); if (this.useDemoCamera) this.setDemoCamera(); }
    restartDemo() { this.demoTime = 0.0; this.demoPlaying = true; this.lighting.evaluate(this.demoTime, DEMO_DURATION); this.useDemoCamera = true; this.setDemoCamera(); }
    setDemoCamera() { const sample = this.demoPath.sample(this.demoTime / DEMO_DURATION); this.camera.setLookAt(sample.position, sample.target); }
    updateManualCamera(dt) {
      if (this.useDemoCamera || this.keys.size === 0) return;
      const basis = this.camera.getBasis(); let move = Vec3.zero();
      if (this.keys.has('w')) move = move.add(basis.forward); if (this.keys.has('s')) move = move.sub(basis.forward);
      if (this.keys.has('d')) move = move.add(basis.right); if (this.keys.has('a')) move = move.sub(basis.right);
      if (this.keys.has('e')) move = move.add(new Vec3(0, 1, 0)); if (this.keys.has('q')) move = move.sub(new Vec3(0, 1, 0));
      if (move.length() > 0) this.camera.move(move.normalize(), 2.6 * dt);
    }
    onKeyDown(e) {
      const k = e.key.toLowerCase();
      if (k === 'f') { this.demoPlaying = !this.demoPlaying; e.preventDefault(); return; }
      if (k === 't') { this.restartDemo(); e.preventDefault(); return; }
      if (k === 'm') { this.useDemoCamera = false; e.preventDefault(); return; }
      if (k === 'p') { this.useDemoCamera = true; this.setDemoCamera(); e.preventDefault(); return; }
      if (k === 'r') { this.camera.reset(); this.useDemoCamera = false; e.preventDefault(); return; }
      if (k === '-' || k === '_') { this.stepRenderScale(-1); e.preventDefault(); return; }
      if (k === '+' || k === '=') { this.stepRenderScale(1); e.preventDefault(); return; }
      if ('wasdqe'.includes(k)) { this.useDemoCamera = false; this.keys.add(k); e.preventDefault(); }
    }
    onMouseMove(e) {
      if (!this.dragging) return;
      const sensitivity = 0.004;
      const dx = e.clientX - this.lastMouseX; const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX; this.lastMouseY = e.clientY;
      this.camera.rotate(-dx * sensitivity, dy * sensitivity);
    }
    stepRenderScale(direction) {
      const values = [0.25, 0.5, 0.75, 1.0];
      let idx = values.findIndex(v => Math.abs(v - this.renderScale) < 1e-6); if (idx < 0) idx = 1;
      idx = clamp(idx + direction, 0, values.length - 1); this.renderScale = values[idx];
      this.panel.querySelector('[data-action="scale"]').value = String(this.renderScale); this.resize();
    }
    renderFrame() {
      const w = this.canvas.width, h = this.canvas.height;
      const data = this.imageData.data;
      const basis = this.camera.getBasis();
      let offset = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dir = RayTracer.rayDirection(x, y, w, h, basis);
          const color = this.tracer.trace(new Ray(this.camera.position, dir));
          data[offset++] = toByte(color.x);
          data[offset++] = toByte(color.y);
          data[offset++] = toByte(color.z);
          data[offset++] = 255;
        }
      }
      this.ctx.putImageData(this.imageData, 0, 0);
    }
    async loadFiles(fileList) {
      const files = Array.from(fileList || []);
      const objFile = files.find(f => f.name.toLowerCase().endsWith('.obj'));
      if (!objFile) { this.lastLoadMessage = 'No .obj file selected.'; return; }
      try {
        const mtlFilesByName = new Map();
        for (const file of files.filter(f => f.name.toLowerCase().endsWith('.mtl'))) {
          const text = await file.text();
          mtlFilesByName.set(file.name, text); mtlFilesByName.set(file.name.toLowerCase(), text);
        }
        const objText = await objFile.text();
        const result = this.scene.buildFromObjText(objFile.name, objText, mtlFilesByName);
        this.tracer = new RayTracer(this.scene, this.lighting);
        this.demoTime = 0.0; this.lighting.evaluate(this.demoTime, DEMO_DURATION); this.useDemoCamera = true; this.setDemoCamera();
        this.lastLoadMessage = `Loaded ${objFile.name}: ${result.triangleCount} triangles`;
      } catch (err) { this.lastLoadMessage = `OBJ load failed: ${err.message || err}`; console.error(err); }
    }
    updateStatus() {
      const play = this.demoPlaying ? 'Playing' : 'Paused'; const cam = this.useDemoCamera ? 'Demo camera' : 'Manual camera';
      this.panel.querySelector('[data-action="play"]').textContent = this.demoPlaying ? 'Pause' : 'Play';
      this.status.textContent = `${play} | ${cam} | ${Math.round(this.renderScale * 100)}% scale\nLighting: ${this.lighting.label}\nScene: ${this.scene.description}\nTriangles: ${this.scene.triangles.length}\n${this.lastLoadMessage}`;
    }
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function smooth(t) { return t * t * (3.0 - 2.0 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function toByte(v) { return Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, v), 1 / 2.2) * 255))); }

  window.LightingShowcaseApp = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new App());
  else new App();
})();
