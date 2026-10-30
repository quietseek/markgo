package update

import "testing"

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		sign int
	}{{"0.8.0", "0.7.9", 1}, {"0.7.0", "0.7.0", 0}, {"1.0", "1.0.1", -1}, {"0.10.0", "0.9.0", 1}, {"1.2.3-beta", "1.2.3", 0}}
	for _, c := range cases {
		got := CompareVersions(c.a, c.b)
		if (got > 0) != (c.sign > 0) || (got < 0) != (c.sign < 0) {
			t.Errorf("%s vs %s = %d", c.a, c.b, got)
		}
	}
}
