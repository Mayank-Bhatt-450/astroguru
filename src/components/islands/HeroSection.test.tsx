import { render, screen } from '@testing-library/react';
import { useAppStore, selectConfig, selectContent } from '../../stores/appStore';
import HeroSection from './HeroSection';
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

describe('HeroSection', () => {
  const defaultUrgencyConfig = {
    enabled: true,
    slotsLeftText: 'Only {n} slot(s) left this week',
    responseTimeHours: 3,
    promoText: 'Limited spots this month',
    countdownEndTime: '',
  };

  const defaultConfig = {
    whatsapp: {
      enabled: false,
      number: '',
      buttonText: '',
      position: 'bottom-right' as const,
      defaultMessage: '',
    },
    urgency: defaultUrgencyConfig,
  };

  const defaultBoot = {
    v: 2,
    config: defaultConfig,
    services: [],
    pricing: [],
    testimonials: [],
    faqs: [],
    content: {
      hero: { headline: 'Test Headline', subheadline: 'Test Subheadline', ctaText: 'Book Now', ctaSubText: '' },
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
        content: defaultBoot.content,
        config: defaultConfig,
        openServicePicker: vi.fn(),
      };
      return selector(state);
    });
  });

  it('renders urgency badge with promo text when enabled', () => {
    render(<HeroSection />);
    
    const badge = screen.getByText('Limited spots this month');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge-violet');
  });

  it('renders fallback text when urgency is disabled', () => {
    const disabledBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        urgency: { ...defaultUrgencyConfig, enabled: false },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: disabledBoot,
        bootStatus: 'ready',
        bootError: null,
        content: disabledBoot.content,
        config: disabledBoot.config,
        openServicePicker: vi.fn(),
      };
      return selector(state);
    });

    render(<HeroSection />);
    
    const badge = screen.getByText('Live Consultations Available');
    expect(badge).toBeInTheDocument();
  });

  it('renders fallback text while boot is loading', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: null,
        bootStatus: 'loading',
        bootError: null,
        content: defaultBoot.content,
        config: defaultConfig,
        openServicePicker: vi.fn(),
      };
      return selector(state);
    });

    render(<HeroSection />);
    
    const badge = screen.getByText('Live Consultations Available');
    expect(badge).toBeInTheDocument();
  });

  it('renders hero headline and subheadline', () => {
    render(<HeroSection />);
    
    expect(screen.getByText('Test Headline')).toBeInTheDocument();
    expect(screen.getByText('Test Subheadline')).toBeInTheDocument();
  });

  it('renders Book a Consultation button', () => {
    render(<HeroSection />);
    
    const button = screen.getByRole('button', { name: /book now/i });
    expect(button).toBeInTheDocument();
  });

  it('renders urgency badge with promo text when enabled is string "true"', () => {
    const stringTrueBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        urgency: { ...defaultUrgencyConfig, enabled: 'true' as unknown as boolean },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: stringTrueBoot,
        bootStatus: 'ready',
        bootError: null,
        content: stringTrueBoot.content,
        config: stringTrueBoot.config,
        openServicePicker: vi.fn(),
      };
      return selector(state);
    });

    render(<HeroSection />);
    
    const badge = screen.getByText('Limited spots this month');
    expect(badge).toBeInTheDocument();
  });

  it('renders fallback text when urgency enabled is string "false"', () => {
    const stringFalseBoot = {
      ...defaultBoot,
      config: {
        ...defaultConfig,
        urgency: { ...defaultUrgencyConfig, enabled: 'false' as unknown as boolean },
      },
    };
    
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        boot: stringFalseBoot,
        bootStatus: 'ready',
        bootError: null,
        content: stringFalseBoot.content,
        config: stringFalseBoot.config,
        openServicePicker: vi.fn(),
      };
      return selector(state);
    });

    render(<HeroSection />);
    
    const badge = screen.getByText('Live Consultations Available');
    expect(badge).toBeInTheDocument();
  });
});