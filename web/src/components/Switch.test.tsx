import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('é um switch acessível com o estado em aria-checked', () => {
    render(<Switch checked label="Acompanhar Varkos" onChange={() => {}} />);
    const el = screen.getByRole('switch', { name: 'Acompanhar Varkos' });
    expect(el.getAttribute('aria-checked')).toBe('true');
  });

  it('clicar inverte o valor', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Acompanhar" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('desabilitado não dispara', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Acompanhar" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
