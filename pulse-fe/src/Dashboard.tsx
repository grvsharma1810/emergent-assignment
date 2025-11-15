import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';

export const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [favoriteColor, setFavoriteColor] = useState<string>('');
  const [newColor, setNewColor] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorLoading, setColorLoading] = useState(false);
  const [colorMessage, setColorMessage] = useState<string>('');

  useEffect(() => {
    // Fetch user data and favorite color from the authenticated APIs
    const fetchData = async () => {
      try {
        // Fetch user data
        const userResponse = await fetch(`${BACKEND_URL}/user`, {
          credentials: 'include', // Important: includes cookies in the request
        });

        if (!userResponse.ok) {
          throw new Error('Failed to fetch user data');
        }

        const userData = await userResponse.json();
        setUser(userData.user);

        // Fetch favorite color
        const colorResponse = await fetch(`${BACKEND_URL}/favorite-color`, {
          credentials: 'include',
        });

        if (colorResponse.ok) {
          const colorData = await colorResponse.json();
          setFavoriteColor(colorData.favoriteColor || '');
          setNewColor(colorData.favoriteColor || '');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSignOut = () => {
    window.location.href = `${BACKEND_URL}/logout`;
  };

  const handleUpdateColor = async () => {
    if (!newColor.trim()) {
      setColorMessage('Please enter a color');
      return;
    }

    setColorLoading(true);
    setColorMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/favorite-color`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ favoriteColor: newColor }),
      });

      if (!response.ok) {
        throw new Error('Failed to update favorite color');
      }

      const data = await response.json();
      setFavoriteColor(data.favoriteColor);
      setColorMessage('Favorite color updated successfully!');
    } catch (err) {
      setColorMessage(err instanceof Error ? err.message : 'Failed to update color');
    } finally {
      setColorLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="App">
        <h1>Loading...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => window.location.href = '/'}>Go back</button>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>Authentication Success!</h1>
      <p>Welcome to your dashboard</p>

      {user && (
        <div style={{ marginTop: '2rem' }}>
          <h2>User Information</h2>
          <div style={{
            background: 'black',
            padding: '1rem',
            borderRadius: '8px',
            textAlign: 'left',
            maxWidth: '500px',
            margin: '1rem auto'
          }}>
            <p><strong>User ID:</strong> {user.id}</p>
            {user.email && <p><strong>Email:</strong> {user.email}</p>}
            {user.firstName && <p><strong>First Name:</strong> {user.firstName}</p>}
            {user.lastName && <p><strong>Last Name:</strong> {user.lastName}</p>}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <h2>Favorite Color</h2>
        <div style={{
          background: 'black',
          padding: '1.5rem',
          borderRadius: '8px',
          maxWidth: '500px',
          margin: '1rem auto'
        }}>
          {favoriteColor && (
            <div style={{ marginBottom: '1rem' }}>
              <p><strong>Current Favorite Color:</strong></p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '0.5rem'
              }}>
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '4px',
                  backgroundColor: favoriteColor,
                  border: '2px solid #ccc'
                }}></div>
                <span>{favoriteColor}</span>
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="colorInput" style={{ display: 'block', marginBottom: '0.5rem' }}>
              <strong>Update Favorite Color:</strong>
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                id="colorInput"
                type="text"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                placeholder="Enter color (e.g., #FF5733, blue)"
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              />
              <button
                onClick={handleUpdateColor}
                disabled={colorLoading}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: colorLoading ? '#ccc' : '#007bff',
                  color: 'white',
                  cursor: colorLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {colorLoading ? 'Updating...' : 'Update'}
              </button>
            </div>
            {colorMessage && (
              <p style={{
                marginTop: '0.5rem',
                color: colorMessage.includes('success') ? 'green' : 'red',
                fontSize: '0.9rem'
              }}>
                {colorMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      <p style={{ marginTop: '2rem' }}>
        <button onClick={handleSignOut}>Sign out</button>
      </p>
    </div>
  );
};
