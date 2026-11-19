import type { ReactNode } from 'react';
import { Tex } from '../learn/kit';
import { FrequencyWidget, FlowWidget, CascadeWidget, MeritWidget, BlackstartWidget } from '../learn/lessons';
import { CircuitWidget, PhasorWidget, ThreePhaseWidget, TransformerWidget, GeneratorWidget, LineWidget, SubstationWidget, DistributionWidget, StabilityWidget, RenewablesWidget } from './widgets';

export interface Question { q: string; options: string[]; answer: number; why: string }
export interface Chapter {
  id: string;
  part: string;
  title: string;
  hook: string;
  minutes: number;
  body: () => ReactNode;
  quiz: Question[];
  /** Where to see it in the rest of the project. */
  try?: { to: string; label: string };
}

export const PARTS = ['The basics', 'The machines', 'The network', 'Running it'];

export const CHAPTERS: Chapter[] = [
  {
    id: 'charge', part: 'The basics', title: 'Charge, voltage and current', minutes: 5,
    hook: 'Everything else in this course is built on three words.',
    body: () => (
      <>
        <p>Electric <b>charge</b> is carried by electrons. When charge moves, that flow is a <b>current</b>, measured in amperes: one ampere is about six billion billion electrons passing a point every second.</p>
        <p>Charge only moves if something pushes it. That push is <b>voltage</b>, measured in volts. Think of voltage as pressure in a pipe and current as the flow of water through it. A bigger pressure pushes more flow; a narrower pipe lets less through. The narrowness is <b>resistance</b>, in ohms.</p>
        <Tex block>{String.raw`I = \frac{V}{R} \qquad P = V\,I = I^2 R`}</Tex>
        <p>The first is Ohm’s law. The second says the <b>power</b>, the rate at which energy is delivered, is voltage times current. In a resistor all of it becomes heat, which is why bulbs glow and why power lines get warm.</p>
        <CircuitWidget />
        <p>Notice the last form of the power law, <Tex>{String.raw`P = I^2 R`}</Tex>. Losses grow with the <i>square</i> of current. Halve the current and you quarter the heat. That one fact explains why power grids use very high voltages, as you will see in chapter 4.</p>
      </>
    ),
    quiz: [
      { q: 'A 12 V battery drives current through a 4 Ω resistor. What is the current?', options: ['0.33 A', '3 A', '48 A'], answer: 1, why: 'I = V / R = 12 / 4 = 3 A.' },
      { q: 'If you double the current in a wire, the heat it produces…', options: ['doubles', 'quadruples', 'stays the same'], answer: 1, why: 'P = I²R, so twice the current gives four times the heat.' },
    ],
  },
  {
    id: 'ac', part: 'The basics', title: 'Alternating current and phasors', minutes: 7,
    hook: 'Why the grid reverses direction fifty times a second, and how engineers draw it.',
    body: () => (
      <>
        <p>The mains does not push charge one way. Its voltage swings positive and negative as a sine wave, 50 times a second in Bangladesh, Britain and most of the world, 60 in the Americas and parts of Japan. This is <b>alternating current</b>.</p>
        <p>AC won over DC because its voltage can be changed easily with transformers, and because spinning generators produce it naturally.</p>
        <p>Engineers draw a sine wave as an arrow spinning around a circle, a <b>phasor</b>. Its length is the amplitude; its angle is where in the cycle it is. When current does not peak at the same moment as voltage, the two arrows sit at an angle φ apart.</p>
        <PhasorWidget />
        <p>Only the part of the current in step with the voltage delivers energy. That is <b>real power</b>, P, in watts. The out-of-step part sloshes back and forth every cycle without doing work. That is <b>reactive power</b>, Q, in vars. Motors and long lines create it; it still heats the wires.</p>
        <Tex block>{String.raw`P = V I \cos\varphi \qquad Q = V I \sin\varphi \qquad S = \sqrt{P^2 + Q^2}`}</Tex>
        <p>Reactive power matters far more than its name suggests. As you will see later, it is what controls <b>voltage</b> on the grid.</p>
      </>
    ),
    quiz: [
      { q: 'A load draws current that lags the voltage by 60°. Its power factor is…', options: ['0.5', '0.87', '1.0'], answer: 0, why: 'cos 60° = 0.5: only half the current does useful work.' },
      { q: 'Reactive power…', options: ['does useful work in motors', 'flows back and forth and mainly affects voltage', 'is not real and never matters'], answer: 1, why: 'It does no net work, but it loads the wires and sets the voltage.' },
    ],
  },
  {
    id: 'three-phase', part: 'The basics', title: 'Three-phase power', minutes: 5,
    hook: 'Three wires, three waves, and a neutral that carries almost nothing.',
    body: () => (
      <>
        <p>Almost every grid on Earth uses three phases: three AC waves, each 120° behind the last. A generator makes them by placing three sets of windings around its stator.</p>
        <p>The clever part: when the three phases carry equal current, their sum is zero at every instant. The return wire, the <b>neutral</b>, carries nothing, so three wires deliver three times the power of one single-phase circuit with no extra return conductor.</p>
        <ThreePhaseWidget />
        <p>Unequal loads leave a remainder that flows in the neutral, which is why distribution engineers spread houses evenly across phases. Power in a balanced three-phase system is</p>
        <Tex block>{String.raw`P = \sqrt{3}\, V_{LL}\, I\, \cos\varphi`}</Tex>
        <p>where V<sub>LL</sub> is the line-to-line voltage, the figure quoted on every transmission line: 132 kV, 230 kV, 400 kV.</p>
      </>
    ),
    quiz: [
      { q: 'In a perfectly balanced three-phase load, the neutral current is…', options: ['three times a phase', 'equal to one phase', 'zero'], answer: 2, why: 'Three equal currents 120° apart sum to zero.' },
      { q: 'The 400 kV on a transmission line is measured…', options: ['between two phase conductors', 'between a conductor and earth', 'across a transformer'], answer: 0, why: 'Ratings quote the line-to-line voltage.' },
    ],
  },
  {
    id: 'transformers', part: 'The machines', title: 'Transformers', minutes: 6,
    hook: 'The machine that made long-distance power possible.',
    body: () => (
      <>
        <p>A transformer is two coils wound on a shared iron core. Alternating current in the first coil creates a changing magnetic field in the core, which induces a voltage in the second. The voltage ratio equals the turns ratio, and the current goes the other way:</p>
        <Tex block>{String.raw`\frac{V_2}{V_1} = \frac{N_2}{N_1} = \frac{I_1}{I_2}`}</Tex>
        <p>Power in equals power out, less about half a percent of losses. So stepping voltage up by thirty times steps current down by thirty times, and the heat lost in the line falls by nine hundred times.</p>
        <TransformerWidget />
        <p>That is why generators at 11–25 kV feed step-up transformers to 230, 400 or even 765 kV, and why substations step it back down in stages until it reaches 230 V in your home.</p>
      </>
    ),
    quiz: [
      { q: 'A transformer steps 11 kV up to 400 kV. The current on the high side is…', options: ['about 36 times larger', 'about 36 times smaller', 'unchanged'], answer: 1, why: 'Power is conserved: current falls by the voltage ratio.' },
      { q: 'Why does a transformer not work on DC?', options: ['DC is too dangerous', 'Only a changing magnetic field induces voltage', 'Iron blocks DC'], answer: 1, why: 'Induction needs a changing flux, which steady DC does not make.' },
    ],
  },
  {
    id: 'generators', part: 'The machines', title: 'Generators', minutes: 7,
    hook: 'Spinning magnets locked in step with every other machine on the grid.',
    body: () => (
      <>
        <p>A synchronous generator is a spinning electromagnet, the <b>rotor</b>, inside fixed windings, the <b>stator</b>. Turn the rotor with steam, gas or water and it induces three-phase voltage in the stator.</p>
        <p>Its speed is locked to grid frequency by its number of poles: a two-pole steam turbine turns at 3,000 rpm for 50 Hz, a slow hydro turbine with many poles at a few hundred.</p>
        <Tex block>{String.raw`n = \frac{120 f}{p} \qquad P = \frac{E\,V}{X}\sin\delta`}</Tex>
        <p>The second equation is the heart of power systems. The generator’s internal voltage E leads the grid voltage V by the <b>load angle</b> δ. Push more steam and δ grows, sending more power. But only up to 90°: beyond that, more angle means less power, the rotor races ahead and <b>slips a pole</b>, out of step with the grid.</p>
        <GeneratorWidget />
        <p>The current in the rotor, the <b>excitation</b>, sets E. Raise it and the generator pushes reactive power into the grid and holds voltage up. Every large generator has an automatic voltage regulator doing exactly this, many times a second.</p>
      </>
    ),
    quiz: [
      { q: 'A four-pole generator on a 50 Hz grid turns at…', options: ['3,000 rpm', '1,500 rpm', '750 rpm'], answer: 1, why: 'n = 120 × 50 / 4 = 1,500 rpm.' },
      { q: 'Power from a synchronous machine is greatest at a load angle of…', options: ['0°', '90°', '180°'], answer: 1, why: 'P ∝ sin δ, which peaks at 90°. Past that, it slips out of step.' },
    ],
    try: { to: '/nuclear/instrumentation', label: 'Synchronise a generator yourself' },
  },
  {
    id: 'lines', part: 'The network', title: 'Transmission lines', minutes: 6,
    hook: 'Why a 400 kV line has a limit, and why its voltage can rise at the far end.',
    body: () => (
      <>
        <p>An overhead line is a set of aluminium conductors strung on steel towers. Electrically it has resistance, which causes losses; <b>reactance</b>, from the magnetic field around the wires, which limits how much power it can carry; and <b>capacitance</b> to earth, which generates reactive power along its length.</p>
        <p>Three things limit a line. Its <b>thermal</b> rating: heat sags the conductor toward the ground. Its <b>voltage</b> limit: heavy load drags the far end down. And on very long lines, <b>stability</b>: the transfer limit from the generator equation, P = V²/X sin δ.</p>
        <LineWidget />
        <p>Lightly loaded, a long line’s capacitance raises the voltage at the far end, the <b>Ferranti effect</b>. This is what helped push voltages too high in Pakistan in 2023 and Iberia in 2025. Underground cables have far more capacitance, which is why long AC cables need reactors, and the longest links use DC.</p>
      </>
    ),
    quiz: [
      { q: 'Doubling a line’s length roughly…', options: ['doubles the power it can carry', 'halves the power it can carry', 'does not change it'], answer: 1, why: 'Reactance grows with length, and Pmax ∝ 1 / X.' },
      { q: 'At very light load, the far end of a long line tends to…', options: ['drop in voltage', 'rise in voltage', 'lose frequency'], answer: 1, why: 'The line’s capacitance raises voltage: the Ferranti effect.' },
    ],
    try: { to: '/atlas/dhaka', label: 'Inspect real lines on the Bangladesh grid' },
  },
  {
    id: 'substations', part: 'The network', title: 'Substations', minutes: 5,
    hook: 'Busbars, breakers and the order you must switch them in.',
    body: () => (
      <>
        <p>A substation is where lines meet, voltages change and circuits are switched. Its backbone is the <b>busbar</b>, a thick conductor every circuit connects to.</p>
        <p>Each circuit has a <b>circuit breaker</b>, which can interrupt huge fault currents in milliseconds by stretching the arc in gas or vacuum, and <b>disconnectors</b>, simple switches that give a visible gap but must never be opened under load. <b>Earth switches</b> make a circuit safe to touch.</p>
        <SubstationWidget />
        <p>Interlocks enforce the sequence mechanically or electrically, because opening a disconnector under load draws an arc that can kill. Around the switchgear sit current and voltage transformers feeding the protection relays you will meet in chapter 11.</p>
      </>
    ),
    quiz: [
      { q: 'To take a feeder out for maintenance, you open…', options: ['the disconnector first', 'the circuit breaker first', 'the earth switch first'], answer: 1, why: 'Only the breaker can interrupt load current.' },
      { q: 'What makes a disconnected circuit safe to work on?', options: ['Opening the breaker', 'Closing the earth switch', 'Opening the busbar'], answer: 1, why: 'Earthing drains any stored or induced charge.' },
    ],
  },
  {
    id: 'distribution', part: 'The network', title: 'From the grid to your plug', minutes: 5,
    hook: 'Five voltage steps between a power station and your kettle.',
    body: () => (
      <>
        <p>Transmission carries bulk power at 230–765 kV. At grid substations it steps down to 132 or 66 kV, then to 33 kV for towns, then 11 kV for neighbourhoods, and finally a pole or pad transformer brings it to 400 V three-phase and 230 V single-phase for homes.</p>
        <DistributionWidget />
        <p>Not every home peaks at once. This <b>diversity</b> means a feeder for 2,000 homes needs a few megawatts, not the sum of every kettle. Hot evenings break diversity: air conditioners all run together, which is why heatwaves overload distribution first.</p>
        <p>About 5–10 % of electricity is lost between power station and plug, most of it in the lower-voltage networks where currents are highest.</p>
      </>
    ),
    quiz: [
      { q: 'Most network losses happen…', options: ['on 400 kV lines', 'in lower-voltage distribution', 'in power stations'], answer: 1, why: 'Currents, and so I²R losses, are highest at low voltage.' },
      { q: 'Diversity means…', options: ['homes do not all peak at the same moment', 'every home uses the same power', 'different voltages in each home'], answer: 0, why: 'That is why a feeder needs far less than the sum of all appliances.' },
    ],
  },
  {
    id: 'power-flow', part: 'The network', title: 'Where power actually goes', minutes: 6,
    hook: 'Electricity divides across paths by their impedance, not by anyone’s plan.',
    body: () => (
      <>
        <p>On a meshed grid you cannot send power down a chosen line. It splits across every parallel path in inverse proportion to their reactance. The DC load flow captures this:</p>
        <Tex block>{String.raw`P_{ij} = \frac{\theta_i - \theta_j}{X_{ij}}, \qquad \mathbf{P} = \mathbf{B}\,\boldsymbol{\theta}`}</Tex>
        <p>Each substation has a voltage angle θ. Solve the linear system for the angles and every flow follows. The full AC load flow adds voltages and reactive power; this project solves it with the fast decoupled method on the real grids.</p>
        <FlowWidget />
        <p>Open one line and its flow jumps instantly onto its neighbours. That is the first step of every cascading blackout.</p>
      </>
    ),
    quiz: [
      { q: 'Two parallel lines, one with twice the reactance of the other. The low-reactance line carries…', options: ['half the power', 'the same power', 'two thirds of the power'], answer: 2, why: 'Flow divides inversely to reactance: 2 : 1.' },
      { q: 'When a line trips, its flow…', options: ['disappears', 'moves onto parallel paths', 'returns to the generator'], answer: 1, why: 'The power still has to reach the load by other routes.' },
    ],
    try: { to: '/what-if/london', label: 'Cut a corridor on the London grid' },
  },
  {
    id: 'frequency', part: 'Running it', title: 'Frequency and inertia', minutes: 7,
    hook: 'Why 50 Hz is a balance sheet, and what decides how far it falls.',
    body: () => (
      <>
        <p>Every synchronous machine spins in lockstep, so frequency is the one quantity every device on the grid shares. When generation equals demand it holds still. Lose a power station and the missing energy comes out of the spinning rotors, which slow down:</p>
        <Tex block>{String.raw`\frac{2H}{f_0}\,\frac{df}{dt} = \frac{P_m - P_e}{S}`}</Tex>
        <p>H, the inertia constant, sets how fast frequency falls. Governors then open valves in proportion to the error, and automatic generation control slowly brings it back to 50.</p>
        <FrequencyWidget />
      </>
    ),
    quiz: [
      { q: 'Halving system inertia makes the initial rate of change of frequency…', options: ['half as steep', 'twice as steep', 'unchanged'], answer: 1, why: 'df/dt ∝ ΔP / H.' },
      { q: 'Which stops the frequency falling in the first seconds?', options: ['Governors and fast reserves', 'Market prices', 'Transformers'], answer: 0, why: 'Primary response acts in seconds; AGC follows over minutes.' },
    ],
    try: { to: '/blackouts/gb-2019', label: 'Watch GB fall to 48.8 Hz in 2019' },
  },
  {
    id: 'protection', part: 'Running it', title: 'Protection and cascades', minutes: 7,
    hook: 'Relays that save equipment, and how they can take a city down.',
    body: () => (
      <>
        <p>Protection relays watch currents and voltages through instrument transformers and trip breakers when something is wrong. Overcurrent relays trip faster for bigger faults; distance relays measure impedance to locate a fault along a line; differential relays compare current in and out of a transformer.</p>
        <p>Lines also have a thermal limit. A modest overload is tolerable for minutes, a big one for seconds:</p>
        <Tex block>{String.raw`\frac{dh}{dt} = \frac{L^2 - 1}{\tau}, \qquad \text{trip when } h \ge 1`}</Tex>
        <CascadeWidget />
        <p>Operators plan for this with the <b>N−1</b> rule: the grid must survive losing any single element. Most big blackouts start when it is broken.</p>
      </>
    ),
    quiz: [
      { q: 'The N−1 rule means…', options: ['one line is always out', 'the grid survives the loss of any single element', 'one generator runs at a time'], answer: 1, why: 'Every credible single failure must be survivable.' },
      { q: 'A distance relay works by…', options: ['measuring impedance to the fault', 'measuring temperature', 'counting faults'], answer: 0, why: 'Voltage over current gives the impedance, proportional to distance.' },
    ],
    try: { to: '/academy/northeast-2003', label: 'Case file: the 2003 cascade' },
  },
  {
    id: 'stability', part: 'Running it', title: 'Stability', minutes: 7,
    hook: 'Clear a fault fast enough and the machine swings back. Too slow and it slips.',
    body: () => (
      <>
        <p>During a short circuit near a generator, it cannot deliver its power, so its rotor accelerates and the load angle grows. When the fault clears, the electrical power comes back, larger than before, and brakes the rotor. If enough braking area is left under the power curve, the rotor swings back. If not, it passes 180° and slips a pole.</p>
        <p>This is the <b>equal area criterion</b>: the energy gained while the fault is on must be matched by the energy removed after. Faster protection means a smaller accelerating area and a more stable system.</p>
        <StabilityWidget />
        <p>Grids also need <b>voltage stability</b> (enough reactive power, or voltage collapses, as in New York in 1977 and Iberia in 2025) and <b>small-signal stability</b> (no growing oscillations between regions).</p>
      </>
    ),
    quiz: [
      { q: 'A heavily loaded generator is…', options: ['more stable', 'less stable', 'equally stable'], answer: 1, why: 'Its operating angle is closer to the limit, leaving less braking area.' },
      { q: 'Faster fault clearing…', options: ['makes it more stable', 'makes it less stable', 'has no effect'], answer: 0, why: 'Less time accelerating means less energy to remove.' },
    ],
  },
  {
    id: 'renewables', part: 'Running it', title: 'Renewables and inverters', minutes: 6,
    hook: 'Wind and solar change the shape of the day and the physics of the grid.',
    body: () => (
      <>
        <p>Solar panels and most wind turbines connect through <b>inverters</b>, power electronics that synthesise an AC wave. They have no spinning mass, so as they replace coal and gas, the grid loses inertia and frequency moves faster after a fault.</p>
        <p>Solar also reshapes demand on everything else: a midday dip and a steep evening ramp as the sun sets and people get home, the famous <b>duck curve</b>.</p>
        <RenewablesWidget />
        <p>The fix is better electronics. Fast frequency response from batteries, and <b>grid-forming</b> inverters that behave like a voltage source rather than following one, can supply the stability that spinning machines used to provide for free.</p>
      </>
    ),
    quiz: [
      { q: 'Why does more solar reduce system inertia?', options: ['Panels are heavy', 'Inverters have no spinning mass', 'Solar runs at 60 Hz'], answer: 1, why: 'Inertia comes from rotating machines, which solar displaces.' },
      { q: 'The duck curve is…', options: ['net demand dipping at midday and ramping steeply at dusk', 'a type of turbine', 'a wind pattern'], answer: 0, why: 'Solar carves out midday demand, leaving a steep evening climb.' },
    ],
    try: { to: '/what-if/adelaide', label: 'Run South Australia on renewables' },
  },
  {
    id: 'markets', part: 'Running it', title: 'Who gets to run', minutes: 5,
    hook: 'The merit order, marginal pricing and why wind lowers prices.',
    body: () => (
      <>
        <p>Plants are dispatched cheapest first. Stack them by marginal cost and the point where the stack meets demand sets the price for everyone.</p>
        <MeritWidget />
        <p>More wind or sun pushes expensive plant out of the stack and drops the price. A cold, still evening calls up the peakers at many times the average cost.</p>
      </>
    ),
    quiz: [
      { q: 'In a marginal-price market, the price is set by…', options: ['the cheapest plant', 'the last plant needed to meet demand', 'an average of all plants'], answer: 1, why: 'Everyone is paid the marginal plant’s price.' },
      { q: 'More wind on a windy day tends to make prices…', options: ['rise', 'fall', 'stay the same'], answer: 1, why: 'Zero-cost wind pushes expensive plant out of the stack.' },
    ],
  },
  {
    id: 'operating', part: 'Running it', title: 'Running a grid, and restarting one', minutes: 7,
    hook: 'Everything together: the control room, and what happens when it all goes dark.',
    body: () => (
      <>
        <p>A control room balances supply and demand second by second, keeps every line within its limits, holds voltages in range and keeps enough reserve to survive the largest single failure. Most of the time that means quiet adjustments; occasionally it means minutes of decisions that decide whether a country stays lit.</p>
        <p>When everything fails, restoration begins at plants that can start on their own, usually hydro. Each block of demand reconnected is, to the small new island, a sudden loss of generation.</p>
        <BlackstartWidget />
        <p>You now know the physics behind every page of this project. Run a city through its shifts, rebuild a real grid from darkness, or relive the nights it all went wrong.</p>
      </>
    ),
    quiz: [
      { q: 'Restoration after a blackout usually starts from…', options: ['nuclear plants', 'plants that can start without outside power, like hydro', 'the biggest coal plant'], answer: 1, why: 'Black-start plants form the first live island.' },
      { q: 'Why reconnect demand in small blocks?', options: ['To save money', 'Each block is a sudden load the small island must absorb', 'Customers prefer it'], answer: 1, why: 'Too large a block collapses the frequency of a small island.' },
    ],
    try: { to: '/black-start/dhaka', label: 'Black start Dhaka yourself' },
  },
];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
