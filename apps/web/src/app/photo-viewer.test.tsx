import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/intl';
import { PhotoButton, PhotoViewerProvider } from './photo-viewer';

function renderPhoto() {
  return render(
    <PhotoViewerProvider>
      <p>Bữa trưa</p>
      <PhotoButton src="thumb.jpg" full="full.jpg" alt="Ảnh bữa trưa" />
    </PhotoViewerProvider>,
  );
}

describe('the photo viewer', () => {
  it('opens the full photo from a tap on the thumbnail, and closes from the button or a tap', async () => {
    renderPhoto();
    expect(screen.queryByTestId('photo-viewer')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Xem ảnh' }));
    const viewer = screen.getByTestId('photo-viewer');
    expect(viewer).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('img', { name: 'Ảnh bữa trưa' })).toHaveAttribute('src', 'full.jpg');
    expect(document.body).toHaveStyle({ overflow: 'hidden' });

    await userEvent.click(screen.getByTestId('photo-viewer-close'));
    // The exit fade plays first: the viewer is still mounted, but already fading out.
    expect(screen.getByTestId('photo-viewer')).toHaveAttribute('data-visible', 'false');
    await waitFor(() => expect(screen.queryByTestId('photo-viewer')).toBeNull());
    expect(document.body.style.overflow).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Xem ảnh' }));
    await userEvent.click(screen.getByTestId('photo-viewer'));
    await waitFor(() => expect(screen.queryByTestId('photo-viewer')).toBeNull());
  });

  it('closes on Escape and gives focus back to the thumbnail', async () => {
    renderPhoto();
    const thumb = screen.getByRole('button', { name: 'Xem ảnh' });
    await userEvent.click(thumb);
    expect(document.activeElement).toBe(screen.getByTestId('photo-viewer'));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('photo-viewer')).toBeNull());
    expect(document.activeElement).toBe(thumb);
  });

  it('fades in after mounting, and a second dismissal during the fade-out is ignored', async () => {
    renderPhoto();
    await userEvent.click(screen.getByRole('button', { name: 'Xem ảnh' }));
    const viewer = screen.getByTestId('photo-viewer');
    await waitFor(() => expect(viewer).toHaveAttribute('data-visible', 'true'));

    await userEvent.click(screen.getByTestId('photo-viewer-close'));
    await userEvent.click(screen.getByTestId('photo-viewer-close'));
    await waitFor(() => expect(screen.queryByTestId('photo-viewer')).toBeNull());
  });

  it('falls back to the thumbnail when there is no larger photo, and to a no-op without a provider', async () => {
    render(<PhotoButton src="thumb.jpg" />);
    await userEvent.click(screen.getByRole('button', { name: 'Xem ảnh' }));
    expect(screen.queryByTestId('photo-viewer')).toBeNull();

    render(
      <PhotoViewerProvider>
        <PhotoButton src="only-thumb.jpg" />
      </PhotoViewerProvider>,
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Xem ảnh' })[1]!);
    expect(screen.getByTestId('photo-viewer').querySelector('img')).toHaveAttribute('src', 'only-thumb.jpg');
  });

  it('does not let the tap reach a row behind it', async () => {
    let rowTaps = 0;
    render(
      <PhotoViewerProvider>
        <div onClick={() => { rowTaps += 1; }}>
          <PhotoButton src="thumb.jpg" />
        </div>
      </PhotoViewerProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xem ảnh' }));
    expect(rowTaps).toBe(0);
    expect(screen.getByTestId('photo-viewer')).toBeInTheDocument();
  });
});
