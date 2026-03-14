import requests
import os

class BambuAuth:
    def __init__(self, token, region="global"):
        self.token = token
        self.base_url = (
            "https://api.bambulab.com" if region == "global"
            else "https://api.bambulab.cn"
        )

    def get_headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    def test_auth(self):
        """Test if authentication is working"""
        url = f"{self.base_url}/v1/user-service/my/profile"
        response = requests.get(url, headers=self.get_headers())

        if response.status_code == 200:
            print("Authentication successful")
            return True
        else:
            print(f"Authentication failed: {response.status_code}")
            return False

    def get_devices(self):
        """Get list of bound devices"""
        url = f"{self.base_url}/v1/iot-service/api/user/bind"
        response = requests.get(url, headers=self.get_headers())
        response.raise_for_status()
        return response.json()


# Usage
token = os.getenv("BAMBU_TOKEN")
auth = BambuAuth(token)

if auth.test_auth():
    devices = auth.get_devices()
    print(f"Found {len(devices.get('devices', []))} devices")