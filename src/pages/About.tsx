import { Link } from 'react-router-dom';
import NetworkMap from '../components/NetworkMap';

export default function About() {
  return (
    <main id="main" className="page about">
      <div className="page-head">
        <h1>About Blackstart</h1>
        <p>A power system simulator that starts with a city that doesn't exist and ends on 17 real grids, 24 historical blackouts and seven nuclear plants. The physics is the same physics a real transmission control room watches every second, reduced to what runs in a browser.</p>
      </div>
      <div className="about-grid">
        <article className="prose">
          <h2>The model</h2>
          <p>Halvern has a 13-substation, 275 kV transmission ring with 19 lines and nine power stations: a two-unit nuclear plant, coal, combined-cycle and peaking gas, a pumped-storage hydro station that can black start, 900 MW of offshore wind, a solar farm, a grid battery and an HVDC link to a neighbouring grid. Seven districts draw power with their own daily shapes, air-conditioning and heating loads, and rooftop solar.</p>
          <ul>
            <li><strong>Frequency.</strong> Each electrical island has its own aggregated swing equation, with the kinetic energy of every synchronised machine. Inverter plant contributes none.</li>
            <li><strong>Control.</strong> Droop governors with first-order lags and deadbands, battery fast frequency response, and automatic generation control weighted by each plant's ramp rate, with anti-windup.</li>
            <li><strong>Power flow.</strong> A DC load flow solved for every island twenty times a simulated second, with line ratings that fall as the air warms.</li>
            <li><strong>Protection.</strong> Inverse-time thermal tripping of overloaded lines, five stages of under-frequency load shedding from 48.8 Hz, loss-of-mains RoCoF tripping of rooftop solar, generator under-frequency trips at 47.5 Hz, and auto-reclose after transient faults.</li>
            <li><strong>Weather.</strong> Seeded random processes for wind, cloud and demand, so every shift replays the same way, and the forecast you see is the noiseless version of the truth.</li>
          </ul>
          <h2>What it leaves out</h2>
          <p>In Halvern, voltage and reactive power are not modelled; its DC load flow assumes flat voltages and lossless lines. The atlas regions use a full AC power flow instead. Machines do not swing against each other inside an island; inter-area oscillations have their own page with a four-machine model. Unit commitment, market bidding and transmission maintenance windows are left to you. The numbers are realistic in size and shape, not calibrated to any one real grid.</p>
          <h2>Built with</h2>
          <p>TypeScript, React and Vite. The city is drawn with three.js: around seven thousand instanced buildings whose windows light from a single shared array of district supply levels, a sodium street grid, catenary power lines and post-processed bloom. The grid engine is plain TypeScript with no dependencies and its own test suite.</p>
          <h2>Real grids and historical events</h2>
          <p>The atlas regions are reduced transmission models built from OpenStreetMap: substations, lines and power stations as mapped by volunteers, with line impedances and ratings estimated from voltage level, circuit count and route length. Demand is spread over substations by the population of nearby settlements. The rest of each interconnection is represented by one external equivalent with its own inertia and governor response. The blackout replays follow the sequence in each investigation report, but they run on these reduced models, so timings and magnitudes are approximate.</p>
          <p>The nuclear control rooms use a lumped point-kinetics and thermal-hydraulic model with published reactor characteristics. They reproduce the mechanisms of each accident, not the detailed plant response.</p>
          <h2>Everything else</h2>
          <p>The Engineering pages isolate one idea each: what a distance relay sees, how a merit-order market sets the price, and how two halves of a grid swing against each other. The predictor is a small neural network trained on thousands of simulated disturbances, with an AI co-pilot that advises in Take control mode. The Live pages read the real British grid every fifteen seconds and American grid operators every hour.</p>
          <h2>How far to trust it</h2>
          <p>Line parameters are typical values, the networks are incomplete, dynamics are aggregated, and the blackout replays mix report-driven steps with simulated physics. None of it has been validated against recorded measurements. The <a href="https://github.com/abeeryaseer24/Power-Systems/blob/main/docs/report.md">technical report</a> sets out every model, assumption and limitation.</p>
          <h2>Data</h2>
          <ul>
            <li>Network, settlement and road data © OpenStreetMap contributors, available under the Open Database Licence.</li>
            <li>World outline from Natural Earth (public domain).</li>
            <li>Live data from Elexon Insights, the NESO Carbon Intensity API and the U.S. Energy Information Administration (EIA-930).</li>
          </ul>
          <h2>Further reading</h2>
          <ul>
            <li>P. Kundur, <em>Power System Stability and Control</em>, McGraw-Hill, 1994.</li>
            <li>J. D. Glover, T. J. Overbye, M. S. Sarma, <em>Power System Analysis and Design</em>, Cengage.</li>
            <li>National Grid ESO, <em>Technical report on the events of 9 August 2019</em>.</li>
            <li>ENTSO-E, <em>Continental Europe synchronous area separation on 8 January 2021</em>, final report.</li>
            <li>ENTSO-E, <em>Frequency stability evaluation criteria for the synchronous zone of Continental Europe</em>.</li>
          </ul>
          <p><Link to="/course">Power Systems 101</Link> explains each of these pieces from scratch, with something to try in every chapter.</p>
        </article>
        <figure className="about-map">
          <NetworkMap />
          <figcaption>Halvern's transmission network. Squares are substations, dots are power stations.</figcaption>
        </figure>
      </div>
    </main>
  );
}
