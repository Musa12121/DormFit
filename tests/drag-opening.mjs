// Use real browser pointer events. Convert room coordinates through the SVG matrix,
// so these checks work at different screen sizes and zoom levels.
export async function dragOpening(page, scope, label, wall, offset, room = { width: 420, depth: 360 }, input = 'mouse') {
  const opening = page.locator(scope).getByRole('button', { name: new RegExp(`^Move ${label},`) });
  const handle = opening.locator('[data-opening-handle]');
  await handle.evaluate(element => element.ownerSVGElement.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const width = Number((await opening.getAttribute('aria-label')).match(/([\d.]+) cm wide/)[1]);
  const destination = await handle.evaluate((element, input) => {
    const floor = element.ownerSVGElement.querySelector(':scope > g');
    const horizontal = input.wall === 'top' || input.wall === 'bottom';
    const x = horizontal ? input.offset + input.width / 2 : input.wall === 'left' ? 0 : input.room.width;
    const y = horizontal ? input.wall === 'top' ? 0 : input.room.depth : input.offset + input.width / 2;
    const point = new DOMPoint(x, y).matrixTransform(floor.getScreenCTM());
    return { x: point.x, y: point.y };
  }, { wall, offset, width, room });
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (input === 'touch') {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let step = 1; step <= 15; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: start.x + (destination.x - start.x) * step / 15,
        y: start.y + (destination.y - start.y) * step / 15,
      }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await session.detach(); }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(destination.x, destination.y, { steps: 15 });
    await page.mouse.up();
  }
}
