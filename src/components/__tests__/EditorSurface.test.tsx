import { fireEvent, render, screen } from '@testing-library/react';
import { EditorSurface } from '../EditorSurface';

describe('EditorSurface', () => {
  it('zooms with toolbar buttons', () => {
    render(<EditorSurface />);

    expect(screen.getByText(/Zoom: 1\.00 \| Selected: 0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    expect(screen.getByText(/Zoom: 1\.10 \| Selected: 0/)).toBeInTheDocument();
  });

  it('renders the interactive canvas surface', () => {
    render(<EditorSurface />);
    expect(screen.getByLabelText('Diagram canvas')).toBeInTheDocument();
  });
});
