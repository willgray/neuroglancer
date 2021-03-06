/**
 * @license
 * Copyright 2016 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {GL, initializeWebGL} from 'neuroglancer/webgl/context';
import {Signal} from 'signals';
import {RefCounted} from 'neuroglancer/util/disposable';

export abstract class RenderedPanel extends RefCounted {
  gl: GL;
  constructor(public context: DisplayContext, public element: HTMLElement) {
    super();
    this.gl = context.gl;
    this.registerEventListener(element, 'mouseover', (event: MouseEvent) => {
      this.context.setActivePanel(this);
    });
    context.addPanel(this);
  }

  scheduleRedraw() { this.context.scheduleRedraw(); }

  setGLViewport() {
    let element = this.element;
    let left = element.offsetLeft + element.clientLeft;
    let width = element.clientWidth;
    let top = element.offsetTop + element.clientTop;
    let height = element.clientHeight;
    let bottom = top + height;
    let gl = this.gl;
    gl.enable(gl.SCISSOR_TEST);
    let glBottom = this.context.canvas.height - bottom;
    gl.viewport(left, glBottom, width, height);
    gl.scissor(left, glBottom, width, height);
  }

  abstract onResize(): void;

  onKeyCommand (action: string) {
    return false;
  }

  abstract draw(): void;
};

export class DisplayContext extends RefCounted {
  canvas = document.createElement('canvas');
  gl: GL;
  updateStarted = new Signal();
  updateFinished = new Signal();
  panels = new Set<RenderedPanel>();
  activePanel: RenderedPanel = null;
  private updatePending: number = null;
  private needsRedraw = false;

  constructor(public container: HTMLElement) {
    super();
    let {canvas} = this;
    canvas.className = 'gl-canvas';
    container.appendChild(canvas);
    this.gl = initializeWebGL(canvas);
    this.registerEventListener(window, 'resize', this.onResize.bind(this));
  }

  disposed() {
    if (this.updatePending != null) {
      cancelAnimationFrame(this.updatePending);
      this.updatePending = null;
    }
  }

  addPanel(panel: RenderedPanel) {
    this.panels.add(panel);
    if (this.activePanel == null) {
      this.setActivePanel(panel);
    }
  }

  setActivePanel(panel: RenderedPanel) {
    let existingPanel = this.activePanel;
    if (existingPanel != null) {
      existingPanel.element.attributes.removeNamedItem('isActivePanel');
    }
    if (panel != null) {
      panel.element.setAttribute('isActivePanel', 'true');
    }
    this.activePanel = panel;
  }

  removePanel(panel: RenderedPanel) {
    this.panels.delete(panel);
    if (panel === this.activePanel) {
      this.setActivePanel(null);
    }
    panel.dispose();
  }

  onResize() {
    this.scheduleRedraw();
    for (let panel of this.panels) {
      panel.onResize();
    }
  }

  scheduleUpdate() {
    if (this.updatePending === null) {
      this.updatePending = requestAnimationFrame(this.update.bind(this));
    }
  }

  scheduleRedraw() {
    if (!this.needsRedraw) {
      this.needsRedraw = true;
      this.scheduleUpdate();
    }
  }

  private update() {
    this.updatePending = null;
    this.updateStarted.dispatch();
    if (this.needsRedraw) {
      // console.log("Redraw");
      this.needsRedraw = false;
      let gl = this.gl;
      let canvas = this.canvas;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (let panel of this.panels) {
        let {element} = panel;
        if (element.clientWidth === 0 || element.clientHeight === 0) {
          // Skip drawing if the panel has zero client area.
          continue;
        }
        panel.setGLViewport();
        panel.draw();
      }
    }
    this.updateFinished.dispatch();
  }
};
