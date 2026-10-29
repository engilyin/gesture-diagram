import { fireEvent, render, screen } from '@testing-library/react';
import { EditorSurface } from '../EditorSurface';

describe('EditorSurface', () => {
  it('zooms with toolbar buttons', () => {
    render(<EditorSurface />);

    expect(screen.getByText(/Zoom: 1\.00 \| Selected: 0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    expect(screen.getByText(/Zoom: 1\.10 \| Selected: 0/)).toBeInTheDocument();
  });

  it('updates selection when clicking an element', () => {
    render(<EditorSurface />);

    fireEvent.click(screen.getByRole('button', { name: 'Select node-1' }));
    expect(screen.getByText(/Selected: 1/)).toBeInTheDocument();
  });
});
