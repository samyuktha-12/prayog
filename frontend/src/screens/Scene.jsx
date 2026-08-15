export default function Scene({ navigate }) {
  return (
    <div>
      <h1>Scene</h1>
      <button onClick={() => navigate('report')}>End Session</button>
    </div>
  )
}
