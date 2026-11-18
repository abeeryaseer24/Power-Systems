import { Link } from 'react-router-dom';
import NetworkMap from '../components/NetworkMap';

export default function About() {
  return (
    <main id="main" className="page about">
      <div className="page-head">
        <h1>About Blackstart</h1>
        <p>A real-time power system simulator for a city that doesn't exist. Halvern is fictional, but the physics running it is the same physics a real transmission control room watches every second.</p>
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
          <p>Voltage and reactive power are not modelled; the DC load flow assumes flat voltages and lossless lines. Machines do not swing against each other inside an island, so there are no inter-area oscillations. Unit commitment, market bidding and transmission maintenance windows are left to you. The numbers are realistic in size and shape, not calibrated to any one real grid.</p>
          <h2>Built with</h2>
          <p>TypeScript, React and Vite. The city is drawn with three.js: around seven thousand instanced buildings whose windows light from a single shared array of district supply levels, a sodium street grid, catenary power lines and post-processed bloom. The grid engine is plain TypeScript with no dependencies and its own test suite.</p>
          <h2>Further reading</h2>
          <ul>
            <li>P. Kundur, <em>Power System Stability and Control</em>, McGraw-Hill, 1994.</li>
            <li>J. D. Glover, T. J. Overbye, M. S. Sarma, <em>Power System Analysis and Design</em>, Cengage.</li>
            <li>National Grid ESO, <em>Technical report on the events of 9 August 2019</em>.</li>
            <li>ENTSO-E, <em>Continental Europe synchronous area separation on 8 January 2021</em>, final report.</li>
            <li>ENTSO-E, <em>Frequency stability evaluation criteria for the synchronous zone of Continental Europe</em>.</li>
          </ul>
          <p><Link to="/learn">The lessons</Link> explain each of these pieces with something to try.</p>
        </article>
        <figure className="about-map">
          <NetworkMap />
          <figcaption>Halvern's transmission network. Squares are substations, dots are power stations.</figcaption>
        </figure>
      </div>
    </main>
  );
}
