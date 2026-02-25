export const themeKeyframes = {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--collapsible-panel-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--collapsible-panel-height)'
					},
					to: {
						height: '0'
					}
				},
				'wes-float': {
					'0%, 100%': {
						transform: 'translateY(0px) rotate(0deg)',
					},
					'50%': {
						transform: 'translateY(-10px) rotate(1deg)',
					}
				},
				'wes-shimmer': {
					'0%': {
						transform: 'translateX(-100%)',
					},
					'100%': {
						transform: 'translateX(100%)',
					}
				},
				'wes-appear': {
					'0%': {
						opacity: '0',
						transform: 'translateY(40px) scale(0.9)',
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0px) scale(1)',
					}
				},
				'film-grain': {
					'0%': { opacity: '0.3' },
					'50%': { opacity: '0.5' },
					'100%': { opacity: '0.3' }
				},
				'vintage-scratches': {
					'0%': { transform: 'translateX(0) translateY(0)' },
					'25%': { transform: 'translateX(1px) translateY(-1px)' },
					'50%': { transform: 'translateX(-1px) translateY(1px)' },
					'75%': { transform: 'translateX(1px) translateY(1px)' },
					'100%': { transform: 'translateX(0) translateY(0)' }
				},
				'typewriter': {
					'from': { width: '0' },
					'to': { width: '100%' }
				},
				'blink-caret': {
					'from, to': { borderColor: 'transparent' },
					'50%': { borderColor: 'hsl(var(--primary))' }
				},
				'vintage-glow': {
					'0%, 100%': { 
						textShadow: '0 0 5px hsl(var(--wes-vintage-gold) / 0.5), 0 0 10px hsl(var(--wes-vintage-gold) / 0.3)'
					},
					'50%': { 
						textShadow: '0 0 8px hsl(var(--wes-vintage-gold) / 0.7), 0 0 15px hsl(var(--wes-vintage-gold) / 0.5)'
					}
				},
				'subtle-wiggle': {
					'0%, 100%': { transform: 'rotate(-0.2deg)' },
					'50%': { transform: 'rotate(0.2deg)' },
				},
				'spin-left-fade': {
					'0%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
					'100%': { 
						transform: 'rotate(-15deg) scale(0.5)', 
						opacity: '0' 
					},
				},
				'spin-right-fade': {
					'0%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
					'100%': { 
						transform: 'rotate(15deg) scale(0.5)', 
						opacity: '0' 
					},
				},
				'spin-left-fade-reverse': {
					'0%': { 
						transform: 'rotate(-15deg) scale(0.5)', 
						opacity: '0' 
					},
					'100%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
				},
				'spin-right-fade-reverse': {
					'0%': { 
						transform: 'rotate(15deg) scale(0.5)', 
						opacity: '0' 
					},
					'100%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
				},
        'custom-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'gradient-shift': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '0.8' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.4' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)', opacity: '0.8' },
          '33%': { transform: 'translateY(-20px) translateX(10px)', opacity: '0.6' },
          '66%': { transform: 'translateY(10px) translateX(-5px)', opacity: '0.9' },
        },
        'float-gentle': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px) scale(1)', opacity: '0.7' },
          '25%': { transform: 'translateY(-15px) translateX(8px) scale(1.1)', opacity: '0.5' },
          '50%': { transform: 'translateY(-8px) translateX(-3px) scale(0.9)', opacity: '0.8' },
          '75%': { transform: 'translateY(5px) translateX(12px) scale(1.05)', opacity: '0.6' },
        },
        'rotate-gentle': {
          '0%, 100%': { transform: 'rotate(0deg) scale(1)', opacity: '0.6' },
          '25%': { transform: 'rotate(5deg) scale(1.1)', opacity: '0.4' },
          '50%': { transform: 'rotate(-3deg) scale(0.95)', opacity: '0.7' },
          '75%': { transform: 'rotate(8deg) scale(1.05)', opacity: '0.5' },
        },
        'paintbrush-stroke': {
          '0%, 100%': { transform: 'rotate(5deg)' },
          '50%': { transform: 'rotate(-12deg)' },
        },
        'particle-burst': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(3.5)', opacity: '0' },
        },
        'paint-particle-sequential': {
          '0%, 15%': { opacity: '0', transform: 'scale(0.5)' },
          '20%': { opacity: '1', transform: 'scale(0.8)' },
          '30%': { opacity: '1', transform: 'scale(2.2)' },
          '45%': { opacity: '0.8', transform: 'scale(1.8)' },
          '60%': { opacity: '0.4', transform: 'scale(1.2)' },
          '80%': { opacity: '0.1', transform: 'scale(0.8)' },
          '100%': { opacity: '0', transform: 'scale(0.5)' },
        },
        'paper-plane-glide-1': {
          '0%': { 
            left: '-50px',
            top: '20%',
            transform: 'rotate(-15deg) scale(0.8)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.2'
          },
          '15%': {
            left: '15%',
            top: '25%',
            transform: 'rotate(-10deg) scale(1) translateY(0)',
          },
          '30%': {
            left: '35%',
            top: '30%',
            transform: 'rotate(-5deg) scale(1.1) translateY(15px)',
          },
          '45%': {
            left: '55%',
            top: '22%',
            transform: 'rotate(5deg) scale(0.95) translateY(-10px)',
          },
          '60%': {
            left: '75%',
            top: '35%',
            transform: 'rotate(15deg) scale(1.05) translateY(20px)',
          },
          '75%': {
            left: '90%',
            top: '28%',
            transform: 'rotate(8deg) scale(0.9) translateY(0)',
          },
          '95%': {
            opacity: '0.15'
          },
          '100%': {
            left: '110%',
            top: '40%',
            transform: 'rotate(25deg) scale(0.7)',
            opacity: '0'
          },
        },
        'paper-plane-loop': {
          '0%': {
            right: '-40px',
            top: '60%',
            transform: 'rotate(180deg) scale(0.6)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.15'
          },
          '20%': {
            right: '20%',
            top: '55%',
            transform: 'rotate(200deg) scale(0.9)',
          },
          '35%': {
            right: '40%',
            top: '45%',
            transform: 'rotate(360deg) scale(1.1)',
          },
          '50%': {
            right: '50%',
            top: '30%',
            transform: 'rotate(540deg) scale(1)',
          },
          '65%': {
            right: '55%',
            top: '50%',
            transform: 'rotate(720deg) scale(0.95)',
          },
          '80%': {
            right: '70%',
            top: '65%',
            transform: 'rotate(810deg) scale(0.85)',
          },
          '95%': {
            opacity: '0.1'
          },
          '100%': {
            right: '110%',
            top: '70%',
            transform: 'rotate(900deg) scale(0.5)',
            opacity: '0'
          },
        },
        'paper-plane-swoop': {
          '0%': {
            left: '50%',
            top: '-40px',
            transform: 'rotate(90deg) scale(0.7) translateX(0)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.18'
          },
          '20%': {
            left: '45%',
            top: '15%',
            transform: 'rotate(110deg) scale(0.9) translateX(-20px)',
          },
          '35%': {
            left: '30%',
            top: '50%',
            transform: 'rotate(180deg) scale(1.15) translateX(-40px)',
          },
          '50%': {
            left: '25%',
            top: '70%',
            transform: 'rotate(210deg) scale(1.1) translateX(-20px)',
          },
          '65%': {
            left: '35%',
            top: '80%',
            transform: 'rotate(240deg) scale(0.95) translateX(10px)',
          },
          '80%': {
            left: '55%',
            top: '85%',
            transform: 'rotate(270deg) scale(0.85) translateX(30px)',
          },
          '95%': {
            opacity: '0.12'
          },
          '100%': {
            left: '80%',
            bottom: '-50px',
            top: 'auto',
            transform: 'rotate(300deg) scale(0.6) translateX(50px)',
            opacity: '0'
          },
        },
        'paper-plane-figure8': {
          '0%': {
            left: '80%',
            top: '50%',
            transform: 'rotate(0deg) scale(0.5)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.12'
          },
          '12.5%': {
            left: '65%',
            top: '35%',
            transform: 'rotate(-30deg) scale(0.8)',
          },
          '25%': {
            left: '50%',
            top: '20%',
            transform: 'rotate(-60deg) scale(0.95)',
          },
          '37.5%': {
            left: '35%',
            top: '35%',
            transform: 'rotate(-90deg) scale(1.05)',
          },
          '50%': {
            left: '20%',
            top: '50%',
            transform: 'rotate(-180deg) scale(1)',
          },
          '62.5%': {
            left: '35%',
            top: '65%',
            transform: 'rotate(-270deg) scale(0.9)',
          },
          '75%': {
            left: '50%',
            top: '80%',
            transform: 'rotate(-360deg) scale(0.85)',
          },
          '87.5%': {
            left: '65%',
            top: '65%',
            transform: 'rotate(-390deg) scale(0.75)',
          },
          '95%': {
            opacity: '0.08'
          },
          '100%': {
            left: '80%',
            top: '50%',
            transform: 'rotate(-420deg) scale(0.5)',
            opacity: '0'
          },
        },
        'brain-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
        'subtle-bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-2px)' },
        },
        'gifting-motion': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-2px) rotate(-5deg)' },
          '75%': { transform: 'translateY(2px) rotate(5deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.9', boxShadow: '0 0 10px hsl(var(--wes-vintage-gold) / 0.3)' },
          '50%': { opacity: '1', boxShadow: '0 0 20px hsl(var(--wes-vintage-gold) / 0.5)' },
        },
        'pulse-breathe': {
          '0%, 100%': { transform: 'scaleX(1)', opacity: '0.8' },
          '50%': { transform: 'scaleX(1.1)', opacity: '1' },
        },
        'pulse-wave': {
          '0%, 100%': { transform: 'scaleX(1) translateX(0)', opacity: '0.8' },
          '50%': { transform: 'scaleX(1.2) translateX(2px)', opacity: '1' },
        },
        'pulse-sweep': {
          '0%': { transform: 'translate(-50%, 50%) rotate(-45deg)' },
          '100%': { transform: 'translate(300%, -200%) rotate(-45deg)' },
        },
        // New diverse paper plane animations
        'paper-plane-diagonal-tl-br': {
          '0%': { top: '-40px', left: '-40px', transform: 'rotate(45deg)' },
          '100%': { top: '110%', left: '110%', transform: 'rotate(45deg)' },
        },
        'paper-plane-diagonal-tr-bl': {
          '0%': { top: '-40px', right: '-40px', transform: 'rotate(135deg)' },
          '100%': { top: '110%', right: '110%', transform: 'rotate(135deg)' },
        },
        'paper-plane-diagonal-bl-tr': {
          '0%': { bottom: '-40px', left: '-40px', transform: 'rotate(-45deg)' },
          '100%': { bottom: '110%', left: '110%', transform: 'rotate(-45deg)' },
        },
        'paper-plane-diagonal-br-tl': {
          '0%': { bottom: '-40px', right: '-40px', transform: 'rotate(-135deg)' },
          '100%': { bottom: '110%', right: '110%', transform: 'rotate(-135deg)' },
        },
        'paper-plane-horizontal-lr': {
          '0%': { left: '-40px', transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg) translateY(-10px)' },
          '50%': { transform: 'rotate(5deg) translateY(10px)' },
          '75%': { transform: 'rotate(-3deg) translateY(-5px)' },
          '100%': { left: '110%', transform: 'rotate(0deg)' },
        },
        'paper-plane-horizontal-rl': {
          '0%': { right: '-40px', transform: 'rotate(180deg)' },
          '25%': { transform: 'rotate(175deg) translateY(-10px)' },
          '50%': { transform: 'rotate(185deg) translateY(10px)' },
          '75%': { transform: 'rotate(177deg) translateY(-5px)' },
          '100%': { right: '110%', transform: 'rotate(180deg)' },
        },
        'paper-plane-vertical-tb': {
          '0%': { top: '-40px', transform: 'rotate(90deg)' },
          '25%': { transform: 'rotate(85deg) translateX(-10px)' },
          '50%': { transform: 'rotate(95deg) translateX(10px)' },
          '75%': { transform: 'rotate(87deg) translateX(-5px)' },
          '100%': { top: '110%', transform: 'rotate(90deg)' },
        },
        'paper-plane-vertical-bt': {
          '0%': { bottom: '-40px', transform: 'rotate(-90deg)' },
          '25%': { transform: 'rotate(-85deg) translateX(-10px)' },
          '50%': { transform: 'rotate(-95deg) translateX(10px)' },
          '75%': { transform: 'rotate(-87deg) translateX(-5px)' },
          '100%': { bottom: '110%', transform: 'rotate(-90deg)' },
        },
        'paper-plane-spiral-cw': {
          '0%': { top: '50%', left: '50%', transform: 'rotate(0deg) translateX(0) scale(0.5)' },
          '25%': { transform: 'rotate(90deg) translateX(200px) scale(0.8)' },
          '50%': { transform: 'rotate(180deg) translateX(300px) scale(1.1)' },
          '75%': { transform: 'rotate(270deg) translateX(400px) scale(1.3)' },
          '100%': { transform: 'rotate(360deg) translateX(600px) scale(1.5)', opacity: '0' },
        },
        'paper-plane-spiral-ccw': {
          '0%': { top: '50%', left: '50%', transform: 'rotate(0deg) translateX(0) scale(0.5)' },
          '25%': { transform: 'rotate(-90deg) translateX(200px) scale(0.8)' },
          '50%': { transform: 'rotate(-180deg) translateX(300px) scale(1.1)' },
          '75%': { transform: 'rotate(-270deg) translateX(400px) scale(1.3)' },
          '100%': { transform: 'rotate(-360deg) translateX(600px) scale(1.5)', opacity: '0' },
        },
        'paper-plane-zigzag-h': {
          '0%': { left: '-40px', top: '20%', transform: 'rotate(20deg)' },
          '12.5%': { left: '10%', top: '60%', transform: 'rotate(-20deg)' },
          '25%': { left: '20%', top: '30%', transform: 'rotate(15deg)' },
          '37.5%': { left: '30%', top: '70%', transform: 'rotate(-15deg)' },
          '50%': { left: '50%', top: '40%', transform: 'rotate(10deg)' },
          '62.5%': { left: '70%', top: '65%', transform: 'rotate(-10deg)' },
          '75%': { left: '80%', top: '25%', transform: 'rotate(5deg)' },
          '87.5%': { left: '90%', top: '55%', transform: 'rotate(-5deg)' },
          '100%': { left: '110%', top: '50%', transform: 'rotate(0deg)' },
        },
        'paper-plane-zigzag-v': {
          '0%': { top: '-40px', left: '20%', transform: 'rotate(110deg)' },
          '12.5%': { top: '10%', left: '60%', transform: 'rotate(70deg)' },
          '25%': { top: '20%', left: '30%', transform: 'rotate(105deg)' },
          '37.5%': { top: '30%', left: '70%', transform: 'rotate(75deg)' },
          '50%': { top: '50%', left: '40%', transform: 'rotate(100deg)' },
          '62.5%': { top: '70%', left: '65%', transform: 'rotate(80deg)' },
          '75%': { top: '80%', left: '25%', transform: 'rotate(95deg)' },
          '87.5%': { top: '90%', left: '55%', transform: 'rotate(85deg)' },
          '100%': { top: '110%', left: '50%', transform: 'rotate(90deg)' },
        },
} as const;
