import json
import math

from libs.ros_adapters.rclpy_topic_streams import to_jsonable_value


def test_non_finite_floats_become_null_so_the_sample_stays_valid_json():
    value = {"position": [0.5, 1.0], "velocity": [0.0, math.nan], "effort": [math.inf, -math.inf]}

    jsonable = to_jsonable_value(value)

    assert jsonable == {"position": [0.5, 1.0], "velocity": [0.0, None], "effort": [None, None]}
    assert "NaN" not in json.dumps(jsonable)
