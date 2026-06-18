import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore, selectConfig } from '../../stores/appStore';
import WhatsAppFab from './WhatsAppFab';
import { act } from 'react';
import { vi } from 'vitest';

// Mock the store
vi.mock('../../stores/appStore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAppStore: vi.fn(),
  };
});

const mockUseAppStore = useAppStore as ReturnType<typeof vi.fn>;

describe('WhatsAppFab', () => {
  const defaultWhatsAppConfig = {
    enabled: true,
    number: '919876543210',
    buttonText: 'Chat with us',
    position: 'bottom-right' as const,
    defaultMessage: "Hi, I'd like to book a consultation.",
  };

  const defaultConfig = {
    whatsapp: defaultWhatsAppConfig,
    urgency: {
      enabled: false,
      slotsLeftText: '',
      responseTimeHours: 3,
      promoText: '',
      countdownEndTime: '',
    },
  };

  const defaultBoot = {
    v: 2,
    config: defaultConfig,
    services: [],
    pricing: [],
    testimonials: [],
    faqs: [],
    content: {
      hero: { headline: '', subheadline: '', ctaText: '', ctaSubText: '' },
      about: { title: '', body: '', credentials: [], yearsExperience: 0, clientsServed: 0 },
      quickConsult: { title: '', description: '', maxQuestions: 3, turnaroundHours: 24, price: 0, priceDisplay: '', exampleQuestions: [] },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: defaultBoot,
        bootStatus: 'ready',
        bootError: null,
        loadBoot: vi.fn(),
      };
      return selector(state);
    });
  });

  it('renders WhatsApp button when enabled', () => {
    render(<WhatsAppFab />);
    
    const link = screen.getByRole('link', { name: /chat with us/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', "https://wa.me/919876543210?text=Hi%2C%20I'd%20like%20to%20book%20a%20consultation.");
  });

  it('does not render when WhatsApp is disabled', () => {
    const disabledBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        whatsapp: { ...defaultWhatsAppConfig, enabled: false },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: disabledBoot,
        bootStatus: 'ready',
        bootError: null,
        loadBoot: vi.fn(),
      };
      return selector(state);
    });

    render(<WhatsAppFab />);
    
    expect(screen.queryByRole('link', { name: /chat with us/i })).not.toBeInTheDocument();
  });

  it('does not render while boot is loading', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: null,
        bootStatus: 'loading',
        bootError: null,
        loadBoot: vi.fn(),
      };
      return selector(state);
    });

    render(<WhatsAppFab />);
    
    expect(screen.queryByRole('link', { name: /chat with us/i })).not.toBeInTheDocument();
  });

  it('renders at bottom-left when position is set', () => {
    const leftBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        whatsapp: { ...defaultWhatsAppConfig, position: 'bottom-left' as const },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: leftBoot,
        bootStatus: 'ready',
        bootError: null,
        loadBoot: vi.fn(),
      };
      return selector(state);
    });

    render(<WhatsAppFab />);
    
    const link = screen.getByRole('link', { name: /chat with us/i });
    expect(link).toHaveStyle({ left: '24px' });
  });

  it('renders when enabled is string "true"', () => {
    const stringTrueBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        whatsapp: { ...defaultWhatsAppConfig, enabled: 'true' as unknown as boolean },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: stringTrueBoot,
        bootStatus: 'ready',
        bootError: null,
        loadBoot: vi.fn(),
      };
      return selector(state);
    });

    render(<WhatsAppFab />);
    
    const link = screen.getByRole('link', { name: /chat with us/i });
    expect(link).toBeInTheDocument();
  });

  it('does not render when enabled is string "false"', () => {
    const stringFalseBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        whatsapp: { ...defaultWhatsAppConfig, enabled: 'false' as unknown as boolean },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: stringFalseBoot,
        bootStatus: 'ready',
        bootError: null,
        loadBoot: vi.fn(),
      };
      return selector(state);
    });

    render(<WhatsAppFab />);
    
    expect(screen.queryByRole('link', { name: /chat with us/i })).not.toBeInTheDocument();
  });
});