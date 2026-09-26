from apps.bloom_api.routes.runtime_common import narrow_allowlist


def test_a_namespace_meets_a_topic_inside_it() -> None:
    # The deployment grants "/ui/", the Widget Lab names its gesture topic: the sim's gesture pad got 403.
    assert narrow_allowlist(("/mode_request", "/ui/"), ("/ui/widget_lab/gesture",)) == ("/ui/widget_lab/gesture",)
    assert narrow_allowlist(("/ui/lamp", "/mode_request"), ("/ui/",)) == ("/ui/lamp",)


def test_a_literal_intersection_and_the_wildcards_still_hold() -> None:
    assert narrow_allowlist(("/a", "/b"), ("/b", "/c")) == ("/b",)
    assert narrow_allowlist(("*",), ("/b",)) == ("/b",)
    assert narrow_allowlist(("/a",), ("*",)) == ("/a",)
    assert narrow_allowlist(("/a",), ()) == ()
    assert narrow_allowlist(("/ui/x/",), ("/ui/",)) == ("/ui/x/",)
