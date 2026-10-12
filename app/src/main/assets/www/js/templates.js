/* SWYP — starter templates. Coordinates are in design pixels: each slide is 1080 wide. */
(function () {
  'use strict';
  const F = (l, t, w, h, o) => Object.assign({ type: 'image', src: null, x: l + w / 2, y: t + h / 2, w, h, rot: 0, opacity: 1, zoom: 1, panX: 0, panY: 0, radius: 0, filter: 'none' }, o);
  const T = (text, x, y, o) => Object.assign({ type: 'text', text, x, y, w: 10, h: 10, rot: 0, opacity: 1, font: 'inter', weight: 400, size: 60, color: '#111116', align: 'center', tracking: 0, leading: 1.2, bg: null }, o);
  const S = (shape, x, y, w, h, o) => Object.assign({ type: 'shape', shape, x, y, w, h, rot: 0, opacity: 1, fill: '#111116', radius: 0 }, o);
  const solid = (c) => ({ type: 'solid', colors: [c], angle: 90 });
  const grad = (a, b, angle) => ({ type: 'gradient', colors: [a, b], angle: angle == null ? 90 : angle });

  const TEMPLATES = [
    {
      id: 'photo-dump', name: 'Photo dump', format: '4:5', slides: 5, bg: solid('#EEECE8'),
      elements: [
        F(60, 60, 960, 1060),
        T('photo dump', 540, 1235, { font: 'chorus', size: 112, color: '#2A2A30' }),
        F(880, 150, 520, 660, { rot: -4, frame: 'white', shadow: true }),
        F(1460, 560, 560, 700),
        T('vol. 01', 1740, 450, { font: 'mono', size: 40, color: '#55555F' }),
        F(2220, 80, 480, 600),
        F(2740, 400, 440, 580),
        T('the little things', 2700, 1190, { font: 'lora', italic: true, size: 74, color: '#2A2A30' }),
        F(3010, 700, 420, 520, { frame: 'polaroid', rot: 5, shadow: true }),
        F(3520, 80, 740, 900),
        S('sparkle', 3700, 1150, 90, 90, { fill: '#2A2A30' }),
        F(4380, 60, 960, 1150),
        T('SEE YOU NEXT MONTH', 4860, 1285, { weight: 600, size: 32, tracking: 22, color: '#2A2A30' })
      ]
    },
    {
      id: 'panorama', name: 'Panorama', format: '4:5', slides: 3, bg: solid('#1E2A26'),
      elements: [
        F(0, 0, 3240, 1350),
        T('Mountains\nare calling', 540, 1040, { font: 'lora', italic: true, size: 124, color: '#FFFFFF', leading: 1.02, shadow: true }),
        T('SWIPE  →', 2700, 1240, { weight: 600, size: 30, tracking: 26, color: '#FFFFFF', shadow: true })
      ]
    },
    {
      id: 'travel-diary', name: 'Travel diary', format: '3:4', slides: 4, bg: solid('#F1EEE8'),
      elements: [
        T('Siargao', 540, 300, { font: 'lora', size: 200, color: '#1E2A26', tracking: -2 }),
        T('a travel diary · 5 days', 540, 465, { font: 'mono', size: 40, color: '#5B5B55' }),
        F(120, 600, 840, 740),
        F(820, 150, 700, 500, { frame: 'film', rot: 3, shadow: true }),
        T('day 01 — cloud 9', 1590, 712, { font: 'mono', size: 38, color: '#5B5B55' }),
        F(1200, 780, 780, 580),
        F(2160, 0, 1080, 880),
        T('salt in the air,\nsand in my hair', 2700, 1080, { font: 'lora', italic: true, size: 72, color: '#1E2A26', leading: 1.25 }),
        S('line', 2700, 1250, 160, 4, { fill: '#1E2A26' }),
        F(3320, 120, 440, 560),
        F(3800, 120, 440, 560),
        F(3320, 720, 920, 560),
        T('until next time', 3780, 1360, { font: 'chorus', size: 84, color: '#1E2A26' })
      ]
    },
    {
      id: 'quotes', name: 'Quote series', format: '4:5', slides: 3, bg: grad('#E0C3FC', '#8EC5FC'),
      elements: [
        S('line', 540, 400, 80, 4, { fill: '#1D1B3A' }),
        T('“Slow down.\nYou’re doing fine.”', 540, 640, { font: 'lora', italic: true, size: 96, color: '#1D1B3A', leading: 1.15 }),
        T('01 / 03', 540, 1200, { weight: 600, size: 30, tracking: 20, color: '#1D1B3A' }),
        S('line', 1620, 400, 80, 4, { fill: '#1D1B3A' }),
        T('“Rest is part\nof the work.”', 1620, 640, { font: 'lora', italic: true, size: 96, color: '#1D1B3A', leading: 1.15 }),
        T('02 / 03', 1620, 1200, { weight: 600, size: 30, tracking: 20, color: '#1D1B3A' }),
        S('line', 2700, 400, 80, 4, { fill: '#1D1B3A' }),
        T('“Small steps\nstill count.”', 2700, 640, { font: 'lora', italic: true, size: 96, color: '#1D1B3A', leading: 1.15 }),
        T('03 / 03', 2700, 1200, { weight: 600, size: 30, tracking: 20, color: '#1D1B3A' })
      ]
    },
    {
      id: 'birthday', name: 'Birthday', format: '1:1', slides: 3, bg: grad('#FFDEE9', '#B5FFFC'),
      elements: [
        T('happy\nbirthday', 420, 480, { font: 'chorus', size: 168, color: '#2A2A30', leading: 0.95 }),
        S('sparkle', 170, 150, 120, 120, { fill: '#F2B84B' }),
        S('heart', 300, 880, 110, 100, { fill: '#F06A6A', rot: -12 }),
        F(820, 230, 620, 620, { radius: 310 }),
        S('ring', 1130, 540, 700, 700, { fill: '#FFFFFF' }),
        T('to my favorite person', 1620, 960, { font: 'poppins', weight: 500, size: 46, color: '#2A2A30' }),
        F(2230, 90, 440, 560, { frame: 'polaroid', rot: -5, shadow: true }),
        F(2720, 330, 440, 560, { frame: 'polaroid', rot: 6, shadow: true }),
        S('star', 2330, 860, 120, 120, { fill: '#F2B84B' }),
        T('more life!', 2700, 1000, { font: 'poppins', weight: 700, size: 64, color: '#2A2A30' })
      ]
    },
    {
      id: 'launch', name: 'Product launch', format: '4:5', slides: 4, bg: solid('#111116'),
      elements: [
        T('NEW', 540, 400, { weight: 900, size: 330, color: '#FFFFFF', tracking: -5 }),
        T('THE SUMMER DROP', 540, 620, { weight: 600, size: 40, tracking: 30, color: '#F2D06B' }),
        F(140, 760, 800, 480, { radius: 24 }),
        F(1200, 90, 760, 1170, { radius: 24 }),
        S('burst', 1080, 1130, 270, 270, { fill: '#F2D06B' }),
        T('20%\nOFF', 1080, 1130, { weight: 900, size: 64, color: '#111116', leading: 0.95, rot: -8 }),
        F(2220, 90, 800, 800, { radius: 24 }),
        T('Light. Breathable. Yours.', 2700, 1030, { weight: 500, size: 52, color: '#FFFFFF', tracking: -1 }),
        T('Available this Friday', 2700, 1115, { size: 36, color: '#9C9CA9' }),
        T('Shop the drop', 3780, 600, { font: 'lora', italic: true, size: 120, color: '#FFFFFF' }),
        T('LINK IN BIO', 3780, 760, { weight: 600, size: 34, tracking: 30, color: '#F2D06B' }),
        S('arrow', 3780, 900, 160, 60, { fill: '#FFFFFF' })
      ]
    },
    {
      id: 'before-after', name: 'Before & after', format: '4:5', slides: 2, bg: solid('#FFFFFF'),
      elements: [
        F(0, 0, 1080, 1350),
        F(1080, 0, 1080, 1350),
        T('BEFORE', 540, 1230, { weight: 700, size: 40, tracking: 25, color: '#FFFFFF', bg: '#111116' }),
        T('AFTER', 1620, 1230, { weight: 700, size: 40, tracking: 25, color: '#111116', bg: '#FFFFFF' })
      ]
    },
    {
      id: 'mood-board', name: 'Mood board', format: '3:4', slides: 2, bg: solid('#ECEAE6'),
      elements: [
        F(60, 60, 600, 820),
        F(700, 60, 780, 400),
        F(1520, 60, 580, 700),
        F(700, 500, 780, 540),
        F(60, 920, 600, 460),
        F(1520, 800, 580, 580),
        T('mood\nboard', 1090, 1210, { font: 'lora', italic: true, size: 96, color: '#2A2A30', leading: 0.95 })
      ]
    }
  ];

  window.Templates = TEMPLATES;
})();
