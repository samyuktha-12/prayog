export default function Setup({ navigate }) {
  return (
    <div>
      <h1>Setup</h1>
      <button onClick={() => navigate('scene')}>Enter Lab</button>
    </div>
  )
}
